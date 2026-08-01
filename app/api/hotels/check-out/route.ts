import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";

// Check-out guest from room
export async function POST(request: NextRequest) {
  try {
    const { reservationId, roomId, actualCheckOutTime, balancePaid } =
      await request.json();

    if (!reservationId || !roomId) {
      return NextResponse.json(
        { error: "Reservation ID and Room ID are required" },
        { status: 400 }
      );
    }

    // Use transaction to ensure all operations succeed
    const result = await transaction(async (client) => {
      // Update reservation status to checked_out
      const resResult = await client.query(
        `
        UPDATE reservations 
        SET status = 'checked_out', updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [reservationId]
      );

      if (resResult.rowCount === 0) {
        throw new Error("Reservation not found");
      }

      // Update room status to dirty/cleaning
      await client.query(
        `
        UPDATE rooms
        SET status = 'dirty', current_guest_id = NULL, updated_at = NOW()
        WHERE id = $1
        `,
        [roomId]
      );

      // Update guest folio balance if payment is made
      if (balancePaid) {
        await client.query(
          `
          UPDATE guest_folios
          SET paid_amount = COALESCE(paid_amount, 0) + $1,
              balance = GREATEST(0, balance - $1),
              last_updated = NOW()
          WHERE reservation_id = $2
          `,
          [balancePaid, reservationId]
        );
      }

      // Create housekeeping task for room cleaning
      await client.query(
        `
        INSERT INTO housekeeping_tasks (room_id, task_type, status, priority)
        VALUES ($1, 'cleaning', 'pending', 'normal')
        `,
        [roomId]
      );

      return resResult.rows[0];
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error checking out guest:", error);
    return NextResponse.json(
      { error: "Failed to check out guest" },
      { status: 500 }
    );
  }
}
