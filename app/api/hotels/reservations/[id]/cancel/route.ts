import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query, transaction } from "@/lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requirePermission("reservations");
  if (error) return error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason || reason.length > 500) return NextResponse.json({ error: "A brief cancellation reason is required (maximum 500 characters)" }, { status: 400 });

  try {
    const result = await transaction(async (client) => {
      const reservation = await client.query(`SELECT id, status, reservation_number, guest_id FROM reservations WHERE id = $1 FOR UPDATE`, [id]);
      if (!reservation.rows[0]) throw new Error("RESERVATION_NOT_FOUND");
      if (["checked_out", "cancelled"].includes(reservation.rows[0].status)) throw new Error("RESERVATION_ALREADY_CLOSED");
      await client.query(`UPDATE reservations SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);
      await client.query(`INSERT INTO reservation_cancellations (reservation_id, cancelled_by, reason) VALUES ($1, $2, $3)`, [id, session.id, reason]);
      const recipients = await client.query(`SELECT id FROM users WHERE is_active = true AND role::text IN ('admin', 'manager', 'restaurantManager')`);
      const title = `Reservation ${reservation.rows[0].reservation_number ?? id} cancelled`;
      const message = `${session.name ?? session.email ?? "A staff member"} cancelled the reservation. Reason: ${reason}`;
      for (const recipient of recipients.rows) {
        await client.query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1, $2, $3, 'reservation_cancelled')`, [recipient.id, title, message]);
      }
      return { reservation: reservation.rows[0], notified: recipients.rowCount ?? 0 };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to cancel reservation";
    const status = message === "RESERVATION_NOT_FOUND" ? 404 : message === "RESERVATION_ALREADY_CLOSED" ? 409 : 500;
    return NextResponse.json({ error: message.startsWith("RESERVATION_") ? "Reservation cannot be cancelled in its current state" : message }, { status });
  }
}
