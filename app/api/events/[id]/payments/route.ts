import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

const allowedMethods = new Set(["cash", "card", "mobile"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const { id: eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const method = typeof body.method === "string" ? body.method : "cash";
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a valid payment amount" }, { status: 400 });
  if (!allowedMethods.has(method)) return NextResponse.json({ error: "Select a valid payment method" }, { status: 400 });

  try {
    const result = await transaction(async (client) => {
      const eventResult = await client.query(
        `SELECT id, name, receipt_id, total_invoiced, total_paid, balance_due FROM events WHERE id = $1 FOR UPDATE`,
        [eventId],
      );
      if (eventResult.rowCount === 0) throw new Error("EVENT_NOT_FOUND");
      const event = eventResult.rows[0];
      if (!event.receipt_id) throw new Error("EVENT_NOT_INVOICED");

      const transactionReference = `EVENT-PAYMENT-${eventId.slice(0, 8).toUpperCase()}-${Date.now()}`;
      const inserted = await client.query(
        `INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by)
         VALUES (NULL, $1, $2, 'GHS', $3::payment_method_enum, 'completed', $4::jsonb, $5::uuid) RETURNING id, created_at`,
        [transactionReference, amount.toFixed(2), method, JSON.stringify({ source: "event_workspace", eventId, eventName: event.name, reference: reference || null, recordedBy: session.id }), session.id],
      );

      const newTotalPaid = Number(event.total_paid ?? 0) + amount;
      const newBalanceDue = Math.max(0, Number(event.total_invoiced ?? 0) - newTotalPaid);
      await client.query(
        `UPDATE events SET total_paid = $1, balance_due = $2, updated_at = now() WHERE id = $3`,
        [newTotalPaid, newBalanceDue, eventId],
      );

      await recordFinancialLedgerEntry(client, {
        eventKey: `event-payment:${eventId}:${transactionReference}`,
        amount,
        currency: "GHS",
        direction: "credit",
        status: "completed",
        source: "event_payment",
        paymentMethod: method,
        entityType: "event",
        entityId: eventId,
        metadata: { eventId, transactionReference, reference: reference || null, recordedBy: session.id },
      });

      await client.query(
        `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, amount, currency, description, metadata, occurred_at)
         VALUES ('payment_recorded', 'event', $1, $2, 'GHS', $3, $4::jsonb, now())`,
        [eventId, amount, `Payment of GHS ${amount.toFixed(2)} recorded via ${method}`, JSON.stringify({ method, transactionReference, reference: reference || null, recordedBy: session.id })],
      );

      return { transactionId: inserted.rows[0].id, createdAt: inserted.rows[0].created_at, totalPaid: newTotalPaid, balanceDue: newBalanceDue };
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to record payment";
    const status = ["EVENT_NOT_FOUND", "EVENT_NOT_INVOICED"].includes(message) ? 409 : 500;
    const friendly = message === "EVENT_NOT_INVOICED" ? "Secure the booking and post an invoice before recording a payment" : message === "EVENT_NOT_FOUND" ? "Event not found" : message;
    return NextResponse.json({ error: friendly }, { status });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
