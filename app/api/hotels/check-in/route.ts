import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Check-in guest to room
export async function POST(request: NextRequest) {
  try {
    const { error } = await requirePermission("checkIn");
    if (error) return error;

    const { reservationId, roomId } = await request.json();

    if (!reservationId || !roomId) {
      return NextResponse.json(
        { error: "Reservation ID and Room ID are required" },
        { status: 400 }
      );
    }

    // Use transaction to ensure both operations succeed
    const result = await transaction(async (client) => {
      // Update reservation status to checked_in
      const resResult = await client.query(
        `
        UPDATE reservations 
        SET status = 'checked_in', room_id = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [roomId, reservationId]
      );

      if (resResult.rowCount === 0) {
        throw new Error("Reservation not found");
      }

      // Update room status to occupied
      await client.query(
        `
        UPDATE rooms
        SET status = 'occupied', current_guest_id = (SELECT guest_id FROM reservations WHERE id = $1), updated_at = NOW()
        WHERE id = $2
        `,
        [reservationId, roomId]
      );

      // Create guest folio
      await client.query(
        `
        INSERT INTO guest_folios (reservation_id, room_charge, total_charges, balance)
        SELECT $1, (SELECT base_price FROM room_types WHERE id = (SELECT room_type_id FROM reservations WHERE id = $1)), 
               (SELECT base_price FROM room_types WHERE id = (SELECT room_type_id FROM reservations WHERE id = $1)), 
               (SELECT base_price FROM room_types WHERE id = (SELECT room_type_id FROM reservations WHERE id = $1))
        `,
        [reservationId]
      );

      return resResult.rows[0];
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error checking in guest:", error);
    return NextResponse.json(
      { error: "Failed to check in guest" },
      { status: 500 }
    );
  }
}
