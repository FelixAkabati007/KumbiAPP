import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requirePermission("events");
  if (error) return error;
  const { id } = await params;
  const [eventResult, receipts, payments, ledger, activity, tasks] = await Promise.all([
    query(`SELECT e.receipt_id, e.total_invoiced, e.total_paid, e.balance_due, EXISTS (SELECT 1 FROM event_quotes q WHERE q.event_id = e.id AND q.status IN ('approved', 'accepted')) AS quote_approved FROM events e WHERE e.id = $1`, [id]),
    query(`SELECT r.id, r.order_number, r.receipt_type, r.snapshot, r.created_at, r.order_id, r.reservation_id FROM hotel_receipts r LEFT JOIN events e ON e.receipt_id = r.id WHERE e.id = $1 OR r.order_id = $1 OR r.reservation_id = $1 ORDER BY CASE WHEN e.id = $1 THEN 0 ELSE 1 END, r.created_at DESC`, [id]),
    query(`WITH event_receipts AS (SELECT id::text AS receipt_id, order_id::text, reservation_id::text, order_number::text FROM hotel_receipts r LEFT JOIN events e ON e.receipt_id = r.id WHERE e.id = $1 OR r.order_id = $1 OR r.reservation_id = $1) SELECT id::text, transaction_id::text, amount, currency, status, payment_method, metadata, created_at, 'transaction_logs'::text AS source FROM transaction_logs WHERE metadata->>'eventId' = $1 OR metadata->>'event_id' = $1 OR metadata->>'receiptId' IN (SELECT receipt_id FROM event_receipts) OR metadata->>'receipt_id' IN (SELECT receipt_id FROM event_receipts) OR metadata->>'orderId' IN (SELECT order_id FROM event_receipts UNION SELECT order_number FROM event_receipts) OR metadata->>'reservationId' IN (SELECT reservation_id FROM event_receipts) UNION ALL SELECT t.id::text, t.transaction_reference::text, t.amount, t.currency, t.status, t.method::text, t.metadata, t.created_at, 'transactions'::text AS source FROM transactions t WHERE t.order_id::text IN (SELECT order_id FROM event_receipts UNION SELECT order_number FROM event_receipts UNION SELECT reservation_id FROM event_receipts) ORDER BY created_at DESC LIMIT 100`, [id]),
    query(`SELECT id, event_key, amount, direction, currency, status, source, occurred_at, payment_method, entity_type, entity_id, metadata FROM canonical_financial_ledger WHERE entity_type = 'event' AND entity_id::text = $1 ORDER BY occurred_at DESC LIMIT 100`, [id]),
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
  const transactionPayments: Array<{ id: string; transaction_id?: string | null; amount: number; currency: string; status: string; payment_method?: string | null; metadata?: Record<string, unknown> | null; created_at: string; source: "transaction_logs" | "transactions" }> = (payments.rows as Array<Record<string, unknown>>).map((payment) => ({ id: String(payment.id), transaction_id: payment.transaction_id == null ? null : String(payment.transaction_id), amount: Number(payment.amount ?? 0), currency: String(payment.currency ?? "GHS"), status: String(payment.status ?? "unknown"), payment_method: payment.payment_method == null ? null : String(payment.payment_method), metadata: (payment.metadata as Record<string, unknown> | null) ?? null, created_at: String(payment.created_at), source: payment.source === "transactions" ? "transactions" : "transaction_logs" }));
  const matchedPayments: Array<Record<string, unknown>> = [...transactionPayments, ...receiptPayments];
  const uniquePayments = matchedPayments.filter((payment, index, all) => all.findIndex((candidate) => candidate.id === payment.id || (candidate.amount === payment.amount && candidate.created_at === payment.created_at)) === index);
  const event = eventResult.rows[0] ?? {};
  const invoiced = Number(event.total_invoiced ?? receipts.rows.reduce((sum: number, receipt) => {
    const snapshot = receipt.snapshot && typeof receipt.snapshot === "object" ? receipt.snapshot as Record<string, unknown> : {};
    return sum + Number(snapshot.total ?? 0);
  }, 0));
  const paid = Number(event.total_paid ?? transactionPayments.filter((payment) => ["completed", "succeeded", "paid"].includes(String((payment as { status?: unknown }).status))).reduce((sum: number, payment) => sum + Number((payment as { amount?: unknown }).amount ?? 0), 0));
  const ledgerPostedTotal = ledger.rows.filter((entry) => entry.direction === "credit").reduce((sum: number, entry) => sum + Number(entry.amount ?? 0), 0);
  const receipt = receipts.rows[0];
  const receiptSnapshot = receipt?.snapshot && typeof receipt.snapshot === "object" ? receipt.snapshot as Record<string, unknown> : {};
  const transactionPaid = transactionPayments.filter((payment) => ["completed", "succeeded", "paid", "success"].includes(String((payment as { status?: unknown }).status))).reduce((sum: number, payment) => sum + Number((payment as { amount?: unknown }).amount ?? 0), 0);
  const paidTotal = transactionPaid > 0 ? transactionPaid : Number(event.total_paid ?? 0);
  const balanceDue = Math.max(0, Number(event.balance_due ?? invoiced - paidTotal));
  const receiptTotal = Number(receiptSnapshot.total ?? 0);
  const hasInvoice = invoiced > 0 || receiptTotal > 0;
  const financeException = receipt && Math.abs((receiptTotal || invoiced) - invoiced) > 0.01 ? "Receipt total does not match the event invoice total" : paidTotal > invoiced + 0.01 ? "Paid amount exceeds the invoice total" : null;
  const financeStatus = financeException ? "exception" : !hasInvoice ? "not_invoiced" : balanceDue <= 0.01 ? "paid" : paidTotal > 0 ? "partially_paid" : "invoice_posted";
  const successfulStatuses = new Set(["paid", "completed", "succeeded", "success"]);
  const pendingStatuses = new Set(["pending", "processing", "authorized"]);
  const failedStatuses = new Set(["failed", "declined", "error", "cancelled", "canceled", "voided"]);
  const successfulPayments = transactionPayments.filter((payment) => successfulStatuses.has(String(payment.status).toLowerCase()));
  const paidFromPayments = successfulPayments.reduce((sum: number, payment) => sum + Number(payment.amount ?? 0), 0);
  const paymentPaidTotal = paidFromPayments || Number(event.total_paid ?? 0);
  const paymentException = paymentPaidTotal > invoiced + 0.01 ? "Paid payments exceed the invoice total" : event.total_paid != null && Math.abs(Number(event.total_paid) - paidFromPayments) > 0.01 && successfulPayments.length > 0 ? "Event paid total differs from matched payments" : null;
  const paymentsSummary = { invoiceTotal: invoiced || receiptTotal, paidTotal: paymentPaidTotal, balanceDue: Math.max(0, Number(event.balance_due ?? invoiced - paymentPaidTotal)), status: paymentException ? "exception" : !hasInvoice ? "not_invoiced" : paymentPaidTotal >= invoiced - 0.01 ? "paid" : paymentPaidTotal > 0 ? "partially_paid" : "awaiting_payment", transactionCount: transactionPayments.length, successfulTransactionCount: successfulPayments.length, pendingTransactionCount: transactionPayments.filter((payment) => pendingStatuses.has(String(payment.status).toLowerCase())).length, failedTransactionCount: transactionPayments.filter((payment) => failedStatuses.has(String(payment.status).toLowerCase())).length, receiptId: event.receipt_id ?? receipt?.id ?? null, lastPaymentAt: successfulPayments[0]?.created_at ?? null, reconciliation: paymentException ? "unmatched" : hasInvoice ? "matched" : "not_applicable", exception: paymentException };
  const finance = { invoiceTotal: invoiced || receiptTotal, subtotal: receiptSnapshot.subtotal == null ? null : Number(receiptSnapshot.subtotal), tax: receiptSnapshot.tax == null ? null : Number(receiptSnapshot.tax), paidTotal, balanceDue, ledgerPostedTotal, transactionCount: transactionPayments.length, receiptId: event.receipt_id ?? receipt?.id ?? null, status: financeStatus, reconciliation: financeException ? "unmatched" : hasInvoice && Math.abs(ledgerPostedTotal - (invoiced || receiptTotal)) <= 0.01 ? "matched" : "unmatched", lastUpdatedAt: receipt?.created_at ?? ledger.rows[0]?.occurred_at ?? null, exception: financeException };
  const openTasks = tasks.rows.filter((task) => {
    const metadata = task.metadata && typeof task.metadata === "object" ? task.metadata as Record<string, unknown> : {};
    return !["completed", "done", "closed"].includes(String(metadata.status ?? "open"));
  }).length;
  const completedTasks = tasks.rows.length - openTasks;
  const summary = {
    paymentsSummary,
    finance,
    booking: { quoteStatus: event.quote_approved ? "approved" : "pending", secured: Boolean(event.receipt_id), status: event.receipt_id ? "complete" : "action_required", detail: event.receipt_id ? "Receipt created and booking secured" : "Quote approval and secure booking required", action: event.receipt_id ? null : "Secure booking" },
    collections: { invoiced, paid, balanceDue, transactionCount: transactionPayments.length, status: balanceDue > 0 ? "awaiting_payment" : "complete", detail: `GHS ${paid.toFixed(2)} paid · GHS ${balanceDue.toFixed(2)} due`, action: balanceDue > 0 ? "Review or record payment" : null },
    delivery: { openTasks, completedTasks, status: openTasks > 0 ? "in_progress" : "action_required", detail: `${openTasks} open · ${completedTasks} completed tasks`, action: openTasks > 0 ? "Complete open tasks" : "Add operational task" },
    records: { documentsAvailable: event.receipt_id ? 3 : 2, activityCount: activity.rows.length, lastActivityAt: activity.rows[0]?.occurred_at ?? null, status: event.receipt_id ? "complete" : "neutral", detail: `${event.receipt_id ? 3 : 2} documents · ${activity.rows.length} activity events`, action: null },
    refreshedAt: new Date().toISOString(),
  };
  return NextResponse.json({ ...summary, receipts: receipts.rows, payments: uniquePayments, ledger: ledger.rows, activity: activity.rows, tasks: tasks.rows });
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
