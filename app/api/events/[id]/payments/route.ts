import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import {
  getPostedEntityCredits,
  recordFinancialLedgerEntry,
} from "@/lib/financial-ledger";

const allowedMethods = new Set(["cash", "card", "mobile"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const { id: eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const method = typeof body.method === "string" ? body.method : "cash";
  const reference =
    typeof body.reference === "string" ? body.reference.trim() : "";
  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "");
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json(
      { error: "Enter a valid payment amount" },
      { status: 400 },
    );
  if (!idempotencyKey)
    return NextResponse.json(
      { error: "Idempotency-Key is required" },
      { status: 400 },
    );
  if (!reference)
    return NextResponse.json(
      { error: "Payment reference is required" },
      { status: 400 },
    );
  if (!allowedMethods.has(method))
    return NextResponse.json(
      { error: "Select a valid payment method" },
      { status: 400 },
    );

  try {
    const result = await transaction(async (client) => {
      const eventResult = await client.query(
        `SELECT id, name, receipt_id, total_invoiced FROM events WHERE id = $1 FOR UPDATE`,
        [eventId],
      );
      if (eventResult.rowCount === 0) throw new Error("EVENT_NOT_FOUND");
      const event = eventResult.rows[0];
      if (!event.receipt_id) throw new Error("EVENT_NOT_INVOICED");

      const currentPaid = await getPostedEntityCredits(
        client,
        "event",
        eventId,
      );
      const invoiceTotal = Number(event.total_invoiced ?? 0);
      if (currentPaid + amount > invoiceTotal + 0.005)
        throw new Error("OVERPAYMENT");
      const transactionReference = `EVENT-PAYMENT-${eventId.slice(0, 8).toUpperCase()}-${idempotencyKey.slice(0, 12).toUpperCase()}`;
      const payment = await client.query(
        `INSERT INTO event_payments (event_id, amount, currency, method, provider_reference, idempotency_key, recorded_by)
         VALUES ($1, $2, 'GHS', $3, $4, $5, $6)
         ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
         RETURNING id, amount, recorded_at`,
        [
          eventId,
          amount.toFixed(2),
          method,
          reference,
          idempotencyKey,
          session.id,
        ],
      );
      const newTotalPaid = currentPaid + Number(payment.rows[0].amount);
      const newBalanceDue = invoiceTotal - newTotalPaid;
      await client.query(
        `UPDATE events SET total_paid = $1, balance_due = $2, updated_at = now() WHERE id = $3`,
        [newTotalPaid, newBalanceDue, eventId],
      );

      await recordFinancialLedgerEntry(client, {
        eventKey: `event-payment:${eventId}:${idempotencyKey}`,
        amount,
        currency: "GHS",
        direction: "credit",
        status: "posted",
        source: "event_payment",
        paymentMethod: method,
        entityType: "event",
        entityId: eventId,
        metadata: {
          eventId,
          paymentId: payment.rows[0].id,
          transactionReference,
          reference,
          idempotencyKey,
          recordedBy: session.id,
        },
      });

      await client.query(
        `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, amount, currency, description, metadata, occurred_at)
         VALUES ('payment_recorded', 'event', $1, $2, 'GHS', $3, $4::jsonb, now())`,
        [
          eventId,
          amount,
          `Payment of GHS ${amount.toFixed(2)} recorded via ${method}`,
          JSON.stringify({
            method,
            transactionReference,
            reference: reference || null,
            recordedBy: session.id,
          }),
        ],
      );

      return {
        paymentId: payment.rows[0].id,
        createdAt: payment.rows[0].recorded_at,
        totalPaid: newTotalPaid,
        balanceDue: newBalanceDue,
      };
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unable to record payment";
    const status = [
      "EVENT_NOT_FOUND",
      "EVENT_NOT_INVOICED",
      "OVERPAYMENT",
    ].includes(message)
      ? 409
      : 500;
    const friendly =
      message === "EVENT_NOT_INVOICED"
        ? "Secure the booking and post an invoice before recording a payment"
        : message === "EVENT_NOT_FOUND"
          ? "Event not found"
          : message === "OVERPAYMENT"
            ? "Payment exceeds the outstanding event balance"
            : message;
    return NextResponse.json({ error: friendly }, { status });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
