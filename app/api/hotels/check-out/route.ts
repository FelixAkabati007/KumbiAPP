import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Check-out guest from room
export async function POST(request: NextRequest) {
  try {
    const { error } = await requirePermission("checkOut");
    if (error) return error;

    const { reservationId, roomId, balancePaid } = await request.json();
    const paid = balancePaid === undefined || balancePaid === null || balancePaid === "" ? 0 : Number(balancePaid);

    if (!reservationId || !roomId) {
      return NextResponse.json(
        { error: "Reservation ID and Room ID are required" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(paid) || paid < 0) {
      return NextResponse.json(
        { error: "Payment amount must be a valid non-negative number" },
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
      if (paid > 0) {
        await client.query(
          `
          UPDATE guest_folios
          SET paid_amount = COALESCE(paid_amount, 0) + $1,
              balance = GREATEST(0, balance - $1),
              last_updated = NOW()
          WHERE reservation_id = $2
          `,
          [paid, reservationId]
        );
      }

      // Operational checkout is complete above. Auxiliary housekeeping and
      // ledger writes must not make a valid checkout fail on older installs.
      try {
        await client.query(
          `INSERT INTO housekeeping_tasks (room_id, task_type, status, priority)
           SELECT $1, 'cleaning', 'pending', 'normal'
           WHERE NOT EXISTS (
             SELECT 1 FROM housekeeping_tasks
             WHERE room_id = $1 AND task_type = 'cleaning'
               AND status IN ('pending', 'in_progress')
           )`,
          [roomId]
        );
      } catch (auxiliaryError) {
        console.error("Checkout housekeeping task failed:", auxiliaryError);
      }

      try {
        await client.query(
          `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, description, metadata)
           VALUES ('checked_out', 'reservation', $1, $1, (SELECT guest_id::text FROM reservations WHERE id = $1), $2, $3, $4, $5)`,
          [reservationId, roomId, paid, `Guest checked out of room ${roomId}`, JSON.stringify({ source: "hotel", balancePaid: paid })]
        );
      } catch (auxiliaryError) {
        console.error("Checkout activity ledger failed:", auxiliaryError);
      }

      return resResult.rows[0];
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error checking out guest:", error);
    const message = error instanceof Error ? error.message : "Failed to check out guest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
