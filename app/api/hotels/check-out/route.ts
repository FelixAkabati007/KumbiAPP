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
      // Lock and validate all related rows before changing any state. This
      // prevents a late validation failure from rolling back the mutation
      // while the client has already shown a success message.
      const folioResult = await client.query(
        `SELECT balance FROM guest_folios WHERE reservation_id = $1 FOR UPDATE`,
        [reservationId]
      );
      const outstandingBalance = Number(folioResult.rows[0]?.balance ?? 0);
      if (paid > outstandingBalance) {
        throw new Error(`Payment cannot exceed the outstanding balance of ${outstandingBalance.toFixed(2)}`);
      }

      const resResult = await client.query(
        `UPDATE reservations SET status = 'checked_out', updated_at = NOW()
         WHERE id = $1 AND status = 'checked_in' RETURNING *`,
        [reservationId]
      );
      if (resResult.rowCount !== 1) throw new Error("Reservation is no longer checked in");

      // Use the reservation's persisted room assignment as the source of truth.
      // The client may have rendered an older room_id during live refresh.
      const checkedOutRoomId = resResult.rows[0].room_id || roomId;
      const roomResult = await client.query(
        `UPDATE rooms SET status = 'dirty', current_guest_id = NULL, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
        [checkedOutRoomId]
      );
      if (roomResult.rowCount !== 1) throw new Error("Room was not found");

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

      // A dirty room must always have an open cleaning task. Keep this in
      // the same transaction as checkout so the app and database cannot drift.
      await client.query(
        `INSERT INTO housekeeping_tasks (room_id, task_type, status, priority)
         SELECT $1, 'cleaning', 'pending', 'normal'
         WHERE NOT EXISTS (
           SELECT 1 FROM housekeeping_tasks
           WHERE room_id = $1 AND task_type = 'cleaning'
             AND status IN ('pending', 'in_progress')
         )`,
        [checkedOutRoomId]
      );

      try {
        await client.query(
          `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, description, metadata)
           VALUES ('checked_out', 'reservation', $1, $1, $2, $3, $4, $5, $6)`,
          [String(reservationId), String(reservationId), String(resResult.rows[0].guest_id), String(checkedOutRoomId), paid, `Guest checked out of room ${checkedOutRoomId}`, JSON.stringify({ source: "hotel", balancePaid: paid })]
        );
      } catch (auxiliaryError) {
        console.error("Checkout activity ledger failed:", auxiliaryError);
      }

      return resResult.rows[0];
    });

    return NextResponse.json(
      { ...result, persisted: true, status: "checked_out" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error checking out guest:", error);
    const message = error instanceof Error ? error.message : "Failed to check out guest";
    const status = message.includes("no longer checked in") || message.includes("cannot exceed") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
