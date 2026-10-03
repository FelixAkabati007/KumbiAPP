"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type WorkspaceStatus = "complete" | "action_required" | "awaiting_payment" | "neutral" | "exception" | "in_progress";
export type FinanceSummary = { invoiceTotal: number; subtotal: number | null; tax: number | null; paidTotal: number; balanceDue: number; ledgerPostedTotal: number; transactionCount: number; receiptId: string | null; status: "not_invoiced" | "invoice_posted" | "partially_paid" | "paid" | "exception"; reconciliation: "matched" | "unmatched" | "not_applicable"; lastUpdatedAt: string | null; exception: string | null };
export type PaymentSummary = { invoiceTotal: number; paidTotal: number; balanceDue: number; status: "not_invoiced" | "awaiting_payment" | "partially_paid" | "paid" | "exception"; transactionCount: number; successfulTransactionCount: number; pendingTransactionCount: number; failedTransactionCount: number; receiptId: string | null; lastPaymentAt: string | null; reconciliation: "matched" | "unmatched" | "not_applicable"; exception: string | null };
export type WorkspaceSummary = { paymentsSummary: PaymentSummary; finance: FinanceSummary; booking: { status: WorkspaceStatus; detail: string; action: string | null; quoteStatus: string; secured: boolean }; collections: { status: WorkspaceStatus; detail: string; action: string | null; invoiced: number; paid: number; balanceDue: number; transactionCount: number }; delivery: { status: WorkspaceStatus; detail: string; action: string | null; openTasks: number; completedTasks: number }; records: { status: WorkspaceStatus; detail: string; action: string | null; documentsAvailable: number; activityCount: number; lastActivityAt: string | null }; refreshedAt: string };

export type WorkspaceData = WorkspaceSummary & { receipts: Array<{ id: string; order_number: string; snapshot: { subtotal?: number; tax?: number; total?: number; bookingAccount?: { name?: string }; bookedBy?: { name?: string } }; created_at: string }>; payments: Array<{ id: string; receipt_id?: string; transaction_id?: string; amount: number; currency: string; status: string; payment_method?: string; created_at: string; source?: "receipt" | "transaction_logs" | "transactions" }>; ledger: Array<{ id: string; amount: number; direction: string; currency: string; status: string; occurred_at: string }>; activity: Array<{ id: string; event_type: string; description: string; occurred_at: string }>; tasks: Array<{ id: string; description: string; metadata: { status?: string }; occurred_at: string }> };

export function EventPayments({ data, eventId, onRecorded }: { data: WorkspaceData; eventId: string; onRecorded?: () => void }) { const summary = data.paymentsSummary; const statusLabel = { not_invoiced: "Not invoiced", awaiting_payment: "Invoice posted · Awaiting payment", partially_paid: "Partially paid", paid: "Paid in full", exception: "Payment reconciliation exception" }[summary.status]; const statusTone = summary.status === "exception" ? "border-destructive bg-destructive/5" : summary.status === "paid" ? "border-emerald-300 bg-emerald-50/50" : "border-primary/30 bg-primary/5"; const cashPayments = data.payments.filter((payment) => payment.source !== "receipt"); return <div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Invoice total" value={summary.invoiceTotal} /><Metric label="Paid" value={summary.paidTotal} /><Metric label="Balance due" value={summary.balanceDue} /><Metric label="Successful payments" value={summary.successfulTransactionCount} /></div><div className={`rounded-2xl border p-4 ${statusTone}`}><p className="font-semibold">{statusLabel}</p><p className="mt-1 text-sm text-muted-foreground">{summary.successfulTransactionCount} successful · {summary.pendingTransactionCount} pending · {summary.failedTransactionCount} failed.</p>{summary.exception && <p className="mt-2 text-sm font-medium text-destructive">{summary.exception}</p>}</div><RecordPaymentForm eventId={eventId} receiptId={summary.receiptId} onRecorded={onRecorded} /><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Cash payment transactions</h3><Badge variant="outline">{cashPayments.length} records</Badge></div>{cashPayments.length ? cashPayments.map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-3 rounded-2xl border p-4"><div><div className="flex items-center gap-2"><p className="font-medium">Payment transaction</p><Badge variant="secondary">{payment.status}</Badge></div><p className="text-sm text-muted-foreground">{payment.transaction_id ?? payment.receipt_id ?? payment.id} · {new Date(payment.created_at).toLocaleString()}</p><p className="text-xs text-muted-foreground">Method: {payment.payment_method ?? "Not specified"}</p></div><p className="font-semibold">{payment.currency} {Number(payment.amount).toFixed(2)}</p></div>) : <Empty text={`No cash payment has been recorded for this event. The balance due is GHS ${summary.balanceDue.toFixed(2)}.`} />}</div>; }

export function EventFinance({ data, eventId, onGenerated }: { data: WorkspaceData; eventId: string; onGenerated?: () => void }) { const finance = data.finance; const credits = data.ledger.filter((entry) => entry.direction === "credit"); const statusLabel = { not_invoiced: "Not invoiced", invoice_posted: "Invoice posted · Awaiting payment", partially_paid: "Partially paid", paid: "Paid in full", exception: "Finance exception" }[finance.status]; const statusTone = finance.status === "exception" ? "border-destructive bg-destructive/5" : finance.status === "paid" ? "border-emerald-300 bg-emerald-50/50" : "border-primary/30 bg-primary/5"; return <div className="grid min-w-0 gap-3 sm:gap-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Invoice total" value={finance.invoiceTotal} /><Metric label="Paid" value={finance.paidTotal} /><Metric label="Balance due" value={finance.balanceDue} /><Metric label="Ledger posted" value={finance.ledgerPostedTotal} /></div><div className={`rounded-2xl border p-4 ${statusTone}`}><p className="font-semibold">{statusLabel}</p><p className="mt-1 text-sm text-muted-foreground">{finance.reconciliation === "matched" ? "Receipt and ledger matched." : finance.reconciliation === "unmatched" ? "Receipt and ledger require review." : "No invoice has been posted for this event."}</p>{finance.exception && <p className="mt-2 text-sm font-medium text-destructive">{finance.exception}</p>}</div>{finance.status === "not_invoiced" && <GenerateInvoiceAction eventId={eventId} onGenerated={onGenerated} />}<div className="grid gap-3 sm:grid-cols-2"><Metric label="Receipt subtotal" value={finance.subtotal ?? undefined} /><Metric label="Receipt VAT / tax" value={finance.tax ?? undefined} /></div>{credits.length ? credits.map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-2xl border p-4"><div><p className="font-medium">Ledger credit</p><p className="text-sm text-muted-foreground">{new Date(entry.occurred_at).toLocaleString()} · {entry.status}</p></div><p className="font-semibold">{entry.currency} {Number(entry.amount).toFixed(2)}</p></div>) : <Empty text="No finance ledger entries have been posted for this event yet." />}</div>; }

export function EventOperations({ event, data, eventId }: { event: { name: string; venue: string; guest_count: number; starts_at: string }; data: WorkspaceData; eventId: string }) { const [open, setOpen] = useState(false); const [description, setDescription] = useState(""); const [tasks, setTasks] = useState(data.tasks); const add = async () => { if (!description.trim()) return; const response = await fetch(`/api/events/${eventId}/workspace`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description, status: "task" }) }); if (response.ok) { setTasks((current) => [...current, { id: crypto.randomUUID(), description, metadata: { status: "open" }, occurred_at: new Date().toISOString() }]); setDescription(""); setOpen(false); } }; return <div className="grid gap-4"><div className="rounded-2xl border bg-muted/30 p-4"><p className="font-semibold">Setup brief</p><p className="text-sm text-muted-foreground">{event.name} · {event.venue} · {event.guest_count} guests · {new Date(event.starts_at).toLocaleString()}</p></div><Button variant="outline" onClick={() => setOpen((value) => !value)}>{open ? "Close task form" : "Add operational task"}</Button>{open && <div className="flex flex-col gap-2 sm:flex-row"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Confirm catering setup" /><Button onClick={() => void add()}>Save task</Button></div>}<div className="grid gap-2">{tasks.map((task) => <div key={task.id} className="flex justify-between rounded-xl border p-3"><span>{task.description}</span><Badge variant="secondary">{task.metadata?.status ?? "open"}</Badge></div>)}</div></div>; }

export function EventDocuments({ eventId, receiptId }: { eventId: string; receiptId?: string | null }) { return <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.open(`/events/${eventId}/documents/confirmation`, "_blank")}>Booking confirmation</Button><Button variant="outline" onClick={() => window.open(`/events/${eventId}/documents/invoice`, "_blank")}>Invoice</Button><Button variant="outline" disabled={!receiptId} onClick={() => receiptId && window.open(`/api/hotels/receipts/${receiptId}`, "_blank")}>Receipt</Button></div>; }

export function EventActivity({ data, eventId, receiptId }: { data: WorkspaceData; eventId: string; receiptId?: string | null }) { const [printed, setPrinted] = useState(false); const print = async () => { const response = await fetch(`/api/events/${eventId}/workspace`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: `Receipt ${receiptId ?? ""} printed`, eventType: "receipt_printed", receiptId }) }); setPrinted(response.ok); if (receiptId) window.open(`/api/hotels/receipts/${receiptId}`, "_blank", "noopener,noreferrer"); }; return <div className="grid gap-3"><Button variant="outline" className="w-fit" disabled={!receiptId || printed} onClick={() => void print()}> {printed ? "Receipt print logged" : "Print latest receipt"}</Button>{data.activity.length ? data.activity.map((item) => <div key={item.id} className="rounded-xl border p-3"><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{item.event_type} · {new Date(item.occurred_at).toLocaleString()}</p></div>) : <Empty text="No event activity recorded yet." />}</div>; }

function RecordPaymentForm({ eventId, receiptId, onRecorded }: { eventId: string; receiptId: string | null; onRecorded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setMessage({ type: "error", text: "Enter a valid payment amount" }); return; }
    setSaving(true);
    setMessage(null);
    const response = await fetch(`/api/events/${eventId}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: value, method, reference }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage({ type: "error", text: data.error ?? "Unable to record payment" }); setSaving(false); return; }
    setMessage({ type: "success", text: "Payment recorded." });
    setAmount("");
    setReference("");
    setSaving(false);
    setOpen(false);
    onRecorded?.();
  };

  if (!receiptId) return <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Secure the booking and post an invoice before recording a payment.</div>;

  return <div className="rounded-2xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">Record a payment</p><p className="text-sm text-muted-foreground">Log cash, card, or mobile money received for this event.</p></div>
      <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Record payment"}</Button>
    </div>
    {open && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm font-medium">Amount (GHS)<Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
      <label className="grid gap-1.5 text-sm font-medium">Method<select value={method} onChange={(event) => setMethod(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 font-normal"><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile money</option></select></label>
      <label className="grid gap-1.5 text-sm font-medium">Reference (optional)<Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. Receipt #" /></label>
      <Button onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : "Save payment"}</Button>
    </div>}
    {message && <p className={`mt-3 text-sm font-medium ${message.type === "error" ? "text-destructive" : "text-emerald-600"}`} role="status">{message.text}</p>}
  </div>;
}

function GenerateInvoiceAction({ eventId, onGenerated }: { eventId: string; onGenerated?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const generate = async () => {
    setBusy(true);
    setMessage(null);
    const quotesResponse = await fetch(`/api/events/approved-quotes?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });
    const quotesData = await quotesResponse.json().catch(() => ({ quotes: [] }));
    const quote = (quotesData.quotes ?? [])[0];
    if (!quote) { setMessage({ type: "error", text: "Approve a quote for this event before generating an invoice." }); setBusy(false); return; }
    const response = await fetch("/api/events/secure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, quoteId: quote.id }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage({ type: "error", text: data.error ?? "Unable to generate invoice" }); setBusy(false); return; }
    setMessage({ type: "success", text: "Invoice generated and posted to the ledger." });
    setBusy(false);
    onGenerated?.();
    if (data.receiptId) window.open(`/api/hotels/receipts/${data.receiptId}`, "_blank", "noopener,noreferrer");
  };

  return <div className="rounded-2xl border border-dashed p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">No invoice posted yet</p><p className="text-sm text-muted-foreground">Generate the invoice from the approved quote to open collections and finance tracking.</p></div>
      <Button size="sm" onClick={() => void generate()} disabled={busy}>{busy ? "Generating…" : "Generate invoice"}</Button>
    </div>
    {message && <p className={`mt-3 text-sm font-medium ${message.type === "error" ? "text-destructive" : "text-emerald-600"}`} role="status">{message.text}</p>}
  </div>;
}

function Metric({ label, value }: { label: string; value?: number }) { return <div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">GHS {Number(value || 0).toFixed(2)}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">{text}</div>; }
