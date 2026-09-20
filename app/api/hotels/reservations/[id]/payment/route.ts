import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requirePermission("checkIn");
    if (error) return error;
    const { id: reservationId } = await params;
    const body = await request.json().catch(() => ({}));
    const method = typeof body.method === "string" ? body.method : "cash";
    const result = await transaction(async (client) => {
      const reservation = await client.query(
        `SELECT r.id, r.reservation_number, r.status, rt.base_price, EXISTS (
           SELECT 1 FROM complimentary_authorizations ca
           WHERE ca.reservation_id = r.id AND ca.status = 'active' AND ca.valid_from <= now() AND ca.valid_until > now() AND ca.room_waived = true
         ) AS is_vip
         FROM reservations r JOIN room_types rt ON rt.id = r.room_type_id
         WHERE r.id = $1::uuid FOR UPDATE`,
        [reservationId],
      );
      if (reservation.rowCount !== 1) throw new Error("Reservation not found");
      const booking = reservation.rows[0];
      if (!["confirmed", "pending"].includes(booking.status)) throw new Error("Only confirmed reservations can be paid before check-in");
      const amount = Number(booking.is_vip ? 0 : booking.base_price || 0);
      const reference = `HOTEL-PRECHECKIN-${reservationId}`;
      const existing = await client.query(
        `SELECT id FROM transactions WHERE transaction_reference = $1 FOR UPDATE`,
        [reference],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by)
           VALUES (NULL, $1, $2, 'GHS', $3::payment_method_enum, 'completed', $4::jsonb, $5::uuid)`,
          [reference, amount.toFixed(2), method, JSON.stringify({ source: "hotel-pre-check-in", reservationId, reservationNumber: booking.reservation_number, isVip: booking.is_vip, performedBy: session.id }), session.id],
        );
      } else {
        await client.query(
          `UPDATE transactions SET status = 'completed' WHERE transaction_reference = $1`,
          [reference],
        );
      }
      await recordFinancialLedgerEntry(client, {
        eventKey: reference,
        amount,
        direction: "credit",
        status: "completed",
        source: "hotel-pre-checkin",
        paymentMethod: method,
        entityType: "reservation",
        entityId: reservationId,
        metadata: { reservationNumber: booking.reservation_number, isVip: booking.is_vip, performedBy: session.id },
      });
      return { reservationId, reference, amount, isVip: booking.is_vip };
    });
    return NextResponse.json({ ...result, status: "paid_before_checkin" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record payment" }, { status: 400 });
  }
}
