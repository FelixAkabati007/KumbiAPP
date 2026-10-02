"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, FileText, IndianRupee, Printer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventActivity, EventDocuments, EventFinance, EventOperations, EventPayments, type WorkspaceData } from "@/components/events/event-workspace-panels";
import { EventOperationalSummary } from "@/components/events/event-operational-summary";
import { EventBookingPanel } from "@/components/events/event-booking-panel";
import { EventPricingDesk } from "@/components/events/event-pricing-desk";

type EventRecord = { id: string; name: string; client_name: string; venue: string; starts_at: string; ends_at?: string | null; guest_count: number; status: string; payment_status?: string; receipt_id?: string | null; quote_approved?: boolean; finance_posted?: boolean };
type Tab = "overview" | "quote" | "payments" | "finance" | "operations" | "documents" | "activity";

const labels: Record<string, string> = { planning: "Planning", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "overview", label: "Overview", icon: CalendarDays },
  { id: "quote", label: "Quotes", icon: FileText },
  { id: "payments", label: "Payments", icon: IndianRupee },
  { id: "finance", label: "Finance", icon: IndianRupee },
  { id: "operations", label: "Operations", icon: ClipboardList },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "activity", label: "Activity", icon: CheckCircle2 },
];

export function EventDetailWorkspace({ eventId, autoPrint = false }: { eventId: string; autoPrint?: boolean }) {
  const { user } = useAuth();
  const canPrice = user?.role === "manager" || user?.role === "operationsManager";
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>({ receipts: [], payments: [], ledger: [], activity: [], tasks: [], finance: { invoiceTotal: 0, subtotal: null, tax: null, paidTotal: 0, balanceDue: 0, ledgerPostedTotal: 0, transactionCount: 0, receiptId: null, status: "not_invoiced", reconciliation: "not_applicable", lastUpdatedAt: null, exception: null }, booking: { status: "neutral", detail: "Loading booking status", action: null, quoteStatus: "pending", secured: false }, collections: { status: "neutral", detail: "Loading collection status", action: null, invoiced: 0, paid: 0, balanceDue: 0, transactionCount: 0 }, delivery: { status: "neutral", detail: "Loading delivery status", action: null, openTasks: 0, completedTasks: 0 }, records: { status: "neutral", detail: "Loading records", action: null, documentsAvailable: 0, activityCount: 0, lastActivityAt: null }, refreshedAt: new Date().toISOString() });

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" }).then((response) => response.json()).then((data) => setEvent((data.events ?? []).find((item: EventRecord) => item.id === eventId) ?? null)).finally(() => setLoading(false));
  }, [eventId]);
  useEffect(() => { if (event && autoPrint) window.setTimeout(() => window.print(), 250); }, [event, autoPrint]);
  useEffect(() => {
    let active = true;
    const loadWorkspace = () => fetch(`/api/events/${eventId}/workspace`, { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setWorkspaceData(data); }).catch(() => undefined);
    void loadWorkspace();
    const timer = window.setInterval(() => {
      void loadWorkspace();
      void fetch("/api/events", { cache: "no-store" }).then((response) => response.json()).then((data) => setEvent((data.events ?? []).find((item: EventRecord) => item.id === eventId) ?? null));
    }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [eventId]);

  const eventDate = useMemo(() => event ? new Date(event.starts_at).toLocaleString() : "", [event]);
  if (loading) return <main className="min-h-screen bg-background p-6"><p className="mx-auto max-w-6xl text-sm text-muted-foreground">Loading event workspace…</p></main>;
  if (!event) return <main className="min-h-screen bg-background p-6"><div className="mx-auto max-w-6xl space-y-4"><p className="text-sm text-destructive">Event not found.</p><Button asChild variant="outline"><Link href="/events"><ArrowLeft data-icon="inline-start" />Back to events</Link></Button></div></main>;

  return <main className="min-h-screen bg-background p-4 text-foreground md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between"><div className="space-y-2"><Button asChild variant="ghost" className="px-0"><Link href="/events"><ArrowLeft data-icon="inline-start" />Back to events</Link></Button><p className="text-sm font-medium text-primary">Event workspace</p><h1 className="text-3xl font-bold tracking-tight">{event.name}</h1><p className="text-sm text-muted-foreground">{event.client_name} · {event.venue}</p></div><div className="flex items-center gap-3"><Badge variant="secondary">{labels[event.status] ?? event.status}</Badge><Button asChild variant="outline"><Link href={`/events/${event.id}?print=mock`}><Printer data-icon="inline-start" />Print receipt</Link></Button><Button onClick={() => setTab(event.quote_approved ? (event.receipt_id ? "payments" : "overview") : "quote")}>{event.quote_approved ? (event.receipt_id ? "Review payments" : "Secure booking") : "Review quote"}</Button></div></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Date</p><p className="mt-1 font-semibold">{eventDate}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Venue</p><p className="mt-1 font-semibold">{event.venue}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Guests</p><p className="mt-1 flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" />{event.guest_count}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payment</p><p className="mt-1 font-semibold text-muted-foreground">{event.payment_status === "paid" ? "Paid" : event.payment_status === "partially_paid" ? "Partially paid" : "Unpaid"}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Booking</p><p className="mt-1 font-semibold">{event.receipt_id ? "Secured" : "Needs quote"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{workspaceData.receipts[0]?.snapshot?.bookingAccount?.name ?? workspaceData.receipts[0]?.snapshot?.bookedBy?.name ?? "No booking account"}</p></CardContent></Card></section>
    <EventOperationalSummary summary={workspaceData} onOpen={setTab} />
    <section className="hidden rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-label="Event workflow"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Live operational view</p><p className="text-xs text-muted-foreground">Event, receipt, payments, finance, tasks, documents, and activity refresh every 15 seconds.</p></div><Badge variant="outline">Live sync</Badge></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[{ label: "1. Quotes", tab: "quote" as Tab, ready: Boolean(event.quote_approved), detail: event.quote_approved ? "Approved" : "Needs approval" }, { label: "2. Secure booking", tab: "overview" as Tab, ready: Boolean(event.receipt_id), detail: event.receipt_id ? "Receipt created" : "Not secured" }, { label: "3. Payments", tab: "payments" as Tab, ready: workspaceData.payments.length > 0, detail: `${workspaceData.payments.length} matched` }, { label: "4. Finance", tab: "finance" as Tab, ready: workspaceData.ledger.length > 0, detail: `${workspaceData.ledger.length} entries` }, { label: "5. Operations", tab: "operations" as Tab, ready: workspaceData.tasks.length > 0, detail: `${workspaceData.tasks.length} tasks` }, { label: "6. Documents", tab: "documents" as Tab, ready: Boolean(event.receipt_id), detail: event.receipt_id ? "Ready" : "Waiting" }, { label: "7. Activity", tab: "activity" as Tab, ready: workspaceData.activity.length > 0, detail: `${workspaceData.activity.length} events` }].map((step) => <button type="button" key={step.label} onClick={() => setTab(step.tab)} className="flex min-h-16 items-start gap-2 rounded-xl border border-border bg-background/70 p-3 text-left hover:bg-background"><span className={`mt-1 size-2 shrink-0 rounded-full ${step.ready ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden="true" /><span><span className="block text-sm font-medium">{step.label}</span><span className="block text-xs text-muted-foreground">{step.detail}</span><span className="sr-only">{step.ready ? "complete" : "needs attention"}</span></span></button>)}</div></section>
    <nav className="flex gap-2 overflow-x-auto border-b border-border pb-2" aria-label="Event workspace sections">{tabs.map(({ id, label, icon: Icon }) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} className="shrink-0" onClick={() => setTab(id)}><Icon data-icon="inline-start" />{label}</Button>)}</nav>
    <Card><CardHeader><CardTitle>{tabs.find((item) => item.id === tab)?.label}</CardTitle></CardHeader><CardContent className="space-y-4">
      {tab === "overview" && <><p className="text-sm leading-6 text-muted-foreground">Keep client, schedule, venue, guest requirements, and the next operational action visible here.</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border p-4"><p className="text-sm font-medium">Client contact</p><p className="mt-1 text-sm text-muted-foreground">{event.client_name}</p></div><div className="rounded-2xl border border-border p-4"><p className="text-sm font-medium">Coordinator</p><p className="mt-1 text-sm text-muted-foreground">Unassigned</p></div></div><div className="grid gap-4 md:grid-cols-2"><Card className="border-primary/30 bg-primary/5"><CardHeader><CardTitle>Quote pricing</CardTitle><p className="text-sm text-muted-foreground">Build and review pricing in the Quotes tab.</p></CardHeader><CardContent><Button onClick={() => setTab("quote")}>Open Quotes</Button></CardContent></Card><Card className="border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"><CardHeader><CardTitle>Booking status</CardTitle><p className="text-sm text-muted-foreground">Venue and services are secured from the Quotes tab.</p></CardHeader><CardContent><Button onClick={() => setTab("quote")}>Open Quotes</Button></CardContent></Card></div></>}
      {tab === "quote" && <><EventPricingDesk eventId={event.id} canEdit={canPrice} /><QuoteApprovalPanel eventId={event.id} /><EventBookingPanel eventId={event.id} secured={Boolean(event.receipt_id)} quoteApproved={Boolean(event.quote_approved)} receiptId={event.receipt_id} onReviewQuote={() => setTab("quote")} onSecured={async () => {
        const [eventsResponse, workspaceResponse] = await Promise.all([fetch("/api/events", { cache: "no-store" }), fetch(`/api/events/${event.id}/workspace`, { cache: "no-store" })]);
        if (eventsResponse.ok) { const data = await eventsResponse.json() as { events?: EventRecord[] }; setEvent((data.events ?? []).find((item) => item.id === event.id) ?? null); }
        if (workspaceResponse.ok) setWorkspaceData(await workspaceResponse.json());
      }} /></>}
      {tab === "payments" && <EventPayments data={workspaceData} />}
      {tab === "finance" && <EventFinance data={workspaceData} />}
      {tab === "operations" && <EventOperations event={event} data={workspaceData} eventId={event.id} />}
      {tab === "documents" && <EventDocuments eventId={event.id} receiptId={event.receipt_id} />}
      {tab === "activity" && <EventActivity data={workspaceData} eventId={event.id} receiptId={event.receipt_id} />}
    </CardContent></Card>
  </div></main>;
}

type Quote = { id: string; status: string; subtotal: number; tax_amount: number; total: number; currency?: string; created_at: string; items: Array<{ label: string; quantity: number; amount: number }> };

function QuoteApprovalPanel({ eventId }: { eventId: string }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => fetch(`/api/events/quotes?eventId=${eventId}`, { cache: "no-store" }).then((response) => response.json()).then((data) => setQuotes(data.quotes ?? [])).finally(() => setLoading(false));
  useEffect(() => { void load(); }, [eventId]);
  const transition = async (quoteId: string, status: string) => {
    setBusy(quoteId);
    await fetch("/api/events/quotes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteId, status }) });
    await load();
    setBusy(null);
  };
  if (loading) return <p className="text-sm text-muted-foreground">Loading quote versions…</p>;
  if (!quotes.length) return <div className="grid gap-4"><p className="text-sm text-muted-foreground">No quote versions exist for this event.</p><Button asChild><Link href={`/events?eventId=${eventId}#pricing`}>Create draft quote</Link></Button></div>;
  return <div className="grid gap-4"><div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm leading-6"><p className="font-semibold">Approval control</p><p className="text-muted-foreground">Approved quotes are locked. Changes must be made as a new quote version; only the current approved version can secure the event.</p><Button className="mt-3" size="sm" asChild><Link href={`/events?eventId=${eventId}#pricing`}>Create new quote version</Link></Button></div>{quotes.map((quote) => { const locked = ["approved", "sent", "accepted", "superseded"].includes(quote.status); return <div key={quote.id} className={`rounded-2xl border p-4 ${locked ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20" : "border-border"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Quote {quote.id.slice(0, 8).toUpperCase()}</p><p className="text-sm text-muted-foreground">Created {new Date(quote.created_at).toLocaleString()} · {quote.items.length} line item{quote.items.length === 1 ? "" : "s"}</p></div><Badge variant={quote.status === "approved" ? "default" : "secondary"}>{quote.status.replace("_", " ")}</Badge></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-lg font-semibold">{Number(quote.total).toFixed(2)} {quote.currency ?? "GHS"}</p><div className="flex flex-wrap gap-2">{quote.status === "draft" && <Button size="sm" onClick={() => transition(quote.id, "pending_approval")} disabled={busy === quote.id}>Submit for approval</Button>}{quote.status === "pending_approval" && <Button size="sm" onClick={() => transition(quote.id, "approved")} disabled={busy === quote.id}>Approve quote</Button>}{quote.status === "approved" && <Button size="sm" onClick={() => document.getElementById("event-booking-panel")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Secure this quote</Button>}{locked && <span className="self-center text-xs text-muted-foreground">Locked version</span>}</div></div></div>;})}</div>;
}

export default EventDetailWorkspace;
