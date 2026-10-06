import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { transaction } from "@/lib/db";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const { id: eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const paymentId = String(body.paymentId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const idempotencyKey =
    request.headers.get("Idempotency-Key")?.trim() ||
    String(body.idempotencyKey ?? "").trim();
  if (!paymentId || !reason || !idempotencyKey)
    return NextResponse.json(
      { error: "Payment, reason, and Idempotency-Key are required" },
      { status: 400 },
    );

  try {
    const result = await transaction(async (client) => {
      const paymentResult = await client.query(
        `SELECT id, event_id, amount, currency, method, status, reversed_at FROM event_payments WHERE id = $1 AND event_id = $2 FOR UPDATE`,
        [paymentId, eventId],
      );
      const payment = paymentResult.rows[0];
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");
      if (payment.reversed_at || payment.status === "reversed")
        throw new Error("PAYMENT_ALREADY_REVERSED");
      await client.query(
        `UPDATE event_payments SET status = 'reversed', reversed_at = now(), reversal_reason = $2 WHERE id = $1`,
        [paymentId, reason],
      );
      await recordFinancialLedgerEntry(client, {
        eventKey: `event-payment-reversal:${paymentId}:${idempotencyKey}`,
        amount: Number(payment.amount),
        currency: payment.currency,
        direction: "debit",
        status: "posted",
        source: "event_payment_reversal",
        journalType: "reversal",
        originalEntryId: null,
        paymentMethod: payment.method,
        entityType: "event",
        entityId: eventId,
        metadata: { paymentId, reason, reversedBy: session.id, idempotencyKey },
      });
      const balance = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::numeric AS balance FROM canonical_financial_ledger WHERE entity_type = 'event' AND entity_id = $1 AND status = 'posted'`,
        [eventId],
      );
      await client.query(
        `UPDATE events SET total_paid = GREATEST($1, 0), balance_due = GREATEST(total_invoiced - $1, 0), updated_at = now() WHERE id = $2`,
        [Number(balance.rows[0]?.balance ?? 0), eventId],
      );
      return { paymentId, balance: Number(balance.rows[0]?.balance ?? 0) };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unable to reverse payment";
    const status =
      message === "PAYMENT_NOT_FOUND"
        ? 404
        : message === "PAYMENT_ALREADY_REVERSED"
          ? 409
          : 500;
    return NextResponse.json(
      {
        error:
          status === 500
            ? "Unable to reverse payment"
            : message === "PAYMENT_NOT_FOUND"
              ? "Payment not found"
              : "Payment already reversed",
      },
      { status },
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
