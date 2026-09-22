import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { syncOverdueRoomCharges } from "@/lib/services/hotel-folio";

// Check-out guest from room
export async function POST(request: NextRequest) {
  try {
    const { session, error } = await requirePermission("checkOut");
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
      // Serialize this reservation transition and lock the exact row first.
      const lockedReservation = await client.query(
        `SELECT r.id, r.room_id, r.guest_id, r.status, r.check_in_date,
              (
                SELECT h.snapshot->>'checkedInAt'
                FROM hotel_receipts h
                WHERE h.reservation_id = r.id AND h.receipt_type = 'check_in'
                ORDER BY h.created_at DESC
                LIMIT 1
              ) AS checked_in_at
         FROM reservations r
         WHERE r.id = $1
         FOR UPDATE`,
        [reservationId]
      );
      const currentReservation = lockedReservation.rows[0];
      if (!currentReservation) throw new Error("Reservation not found");
      if (currentReservation.status !== "checked_in") {
        throw new Error(`Reservation is ${currentReservation.status}; only checked-in guests can check out`);
      }
      await syncOverdueRoomCharges(client, reservationId);

      // Lock and validate all related rows before changing any state. This
      // prevents a late validation failure from rolling back the mutation
      // while the client has already shown a success message.
      const folioResult = await client.query(
        `SELECT id, total_charges, paid_amount, balance,
                GREATEST(
                  0,
                  COALESCE(service_charges, 0) + COALESCE(food_charges, 0) + COALESCE(other_charges, 0)
                  - GREATEST(0, COALESCE(paid_amount, 0) - COALESCE(room_charge, 0))
                ) AS extras_outstanding
         FROM guest_folios WHERE reservation_id = $1 FOR UPDATE`,
        [reservationId]
      );
      if (folioResult.rowCount !== 1) throw new Error("Guest folio not found");
      const folio = folioResult.rows[0];
      const outstandingBalance = Number(folio.extras_outstanding ?? 0);
      const folioItems = await client.query(`SELECT category, description, quantity, unit_amount, total_amount FROM guest_folio_items WHERE folio_id = $1 ORDER BY created_at ASC`, [folio.id]);
      const complimentaryResult = await client.query(`SELECT COALESCE(SUM(u.amount_used), 0) AS complimentary_amount FROM complimentary_authorization_usage u JOIN complimentary_authorizations a ON a.id = u.authorization_id WHERE a.reservation_id = $1`, [reservationId]);
      const grossSpent = Number(folio.total_charges ?? 0);
      const complimentaryAmount = Number(complimentaryResult.rows[0]?.complimentary_amount || 0);
      const netSpent = Math.max(0, grossSpent - complimentaryAmount);
      if (paid < outstandingBalance) {
        throw new Error(`Full payment of ${outstandingBalance.toFixed(2)} is required before checkout`);
      }
      if (paid > outstandingBalance) {
        throw new Error(`Payment cannot exceed the outstanding balance of ${outstandingBalance.toFixed(2)}`);
      }

      if (paid > 0) {
        await client.query(`UPDATE guest_folios SET paid_amount = COALESCE(paid_amount, 0) + $1, balance = GREATEST(0, balance - $1), last_updated = NOW() WHERE reservation_id = $2`, [paid, reservationId]);
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

      const verified = await client.query(
        `SELECT id, status, room_id, guest_id FROM reservations WHERE id = $1 AND status = 'checked_out'`,
        [reservationId]
      );
      if (verified.rowCount !== 1) throw new Error("Checkout could not be verified after the transaction update");
      const checkoutActor = { id: session?.id ?? null, name: session?.name ?? null, email: session?.email ?? null, role: session?.role ?? null };
      const receiptResult = await client.query(
        `UPDATE hotel_receipts
         SET version = version + 1,
             snapshot = snapshot || jsonb_build_object('checkedOutBy', $2::jsonb, 'checkedOutAt', NOW()::text, 'balance', 0, 'paymentStatus', 'paid')
         WHERE reservation_id = $1::uuid AND folio_id = $3::uuid
         RETURNING id, snapshot`,
        [reservationId, JSON.stringify(checkoutActor), folio.id]
      );
      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         VALUES ('hotel.checked_out', 'reservation', $1, $2, $3::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [reservationId, `hotel-checkout:${reservationId}`, JSON.stringify({ reservationId, guestId: verified.rows[0].guest_id, roomId: checkedOutRoomId, paid, housekeeping: true, ledger: true })],
      );
      return { ...verified.rows[0], receiptId: receiptResult.rows[0]?.id ?? null, receipt: receiptResult.rows[0]?.snapshot ?? null, folioDisclosure: { grossSpent, complimentaryAmount, netSpent, outstandingBalance, items: folioItems.rows } };
    });

    return NextResponse.json(
      { ...result, persisted: true, status: "checked_out" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error checking out guest:", error);
    const message = error instanceof Error ? error.message : "Failed to check out guest";
    const status = message.includes("no longer checked in") || message.includes("cannot exceed") || message.includes("Full payment") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
