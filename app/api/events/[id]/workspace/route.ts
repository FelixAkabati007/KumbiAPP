import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requirePermission("events");
  if (error) return error;
  const { id } = await params;
  const [receipts, payments, ledger, activity, tasks] = await Promise.all([
    query(`SELECT id, order_number, receipt_type, snapshot, created_at FROM hotel_receipts WHERE order_id = $1 OR reservation_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT id::text, amount, currency, status, payment_method, metadata, created_at FROM transaction_logs WHERE metadata->>'eventId' = $1 OR metadata->>'event_id' = $1 ORDER BY created_at DESC LIMIT 100`, [id]),
    query(`SELECT id, amount, direction, currency, status, occurred_at, payment_method, metadata FROM canonical_financial_ledger WHERE entity_type = 'event' AND entity_id = $1 ORDER BY occurred_at DESC LIMIT 100`, [id]),
    query(`SELECT id, event_type, entity_type, description, metadata, occurred_at, created_by FROM hotel_activity_ledger WHERE entity_id::text = $1 ORDER BY occurred_at DESC LIMIT 100`, [id]),
    query(`SELECT id, event_type, description, metadata, occurred_at, created_by FROM hotel_activity_ledger WHERE entity_type = 'event_task' AND entity_id::text = $1 ORDER BY occurred_at ASC LIMIT 100`, [id]),
  ]);
  const receiptPayments = receipts.rows.map((receipt) => {
    const snapshot = receipt.snapshot && typeof receipt.snapshot === "object" ? receipt.snapshot : {};
    return {
      id: `receipt-${receipt.id}`,
      receipt_id: receipt.id,
      transaction_id: receipt.order_number,
      amount: Number(snapshot.total ?? 0),
      currency: snapshot.currency ?? "GHS",
      status: "recorded",
      payment_method: snapshot.paymentMethod ?? "receipt",
      created_at: receipt.created_at,
      source: "receipt",
    };
  });
  const transactionPayments = payments.rows.map((payment) => ({ ...payment, source: "transaction" as const }));
  const matchedPayments: Array<Record<string, unknown>> = [...transactionPayments, ...receiptPayments];
  const uniquePayments = matchedPayments.filter((payment, index, all) => all.findIndex((candidate) => candidate.id === payment.id || (candidate.amount === payment.amount && candidate.created_at === payment.created_at)) === index);
  return NextResponse.json({ receipts: receipts.rows, payments: uniquePayments, ledger: ledger.rows, activity: activity.rows, tasks: tasks.rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requirePermission("events");
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  if (!body.description) return NextResponse.json({ error: "description is required" }, { status: 400 });
  const entityType = body.status === "task" ? "event_task" : "event";
  const result = await query(`INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, amount, currency, description, metadata, occurred_at) VALUES ($1,$2,$3,0,'GHS',$4,$5::jsonb,now()) RETURNING id`, [body.status === "task" ? "task_created" : body.eventType ?? "event_activity", entityType, id, body.description, JSON.stringify({ status: body.status ?? "open", source: "event_workspace", receiptId: body.receiptId ?? null })]);
  return NextResponse.json({ success: true, id: result.rows[0]?.id });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
