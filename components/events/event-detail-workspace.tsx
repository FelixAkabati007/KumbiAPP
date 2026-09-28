"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, FileText, IndianRupee, Printer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventActivity, EventDocuments, EventFinance, EventOperations, EventPayments } from "@/components/events/event-workspace-panels";

type EventRecord = { id: string; name: string; client_name: string; venue: string; starts_at: string; ends_at?: string | null; guest_count: number; status: string; payment_status?: string; receipt_id?: string | null; quote_approved?: boolean; finance_posted?: boolean };
type Tab = "overview" | "quote" | "payments" | "finance" | "operations" | "documents" | "activity";

const labels: Record<string, string> = { planning: "Planning", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "overview", label: "Overview", icon: CalendarDays },
  { id: "quote", label: "Quote", icon: FileText },
  { id: "payments", label: "Payments", icon: IndianRupee },
  { id: "finance", label: "Finance", icon: IndianRupee },
  { id: "operations", label: "Operations", icon: ClipboardList },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "activity", label: "Activity", icon: CheckCircle2 },
];

export function EventDetailWorkspace({ eventId, autoPrint = false }: { eventId: string; autoPrint?: boolean }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [workspaceData, setWorkspaceData] = useState<any>({ receipts: [], payments: [], activity: [], tasks: [] });

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" }).then((response) => response.json()).then((data) => setEvent((data.events ?? []).find((item: EventRecord) => item.id === eventId) ?? null)).finally(() => setLoading(false));
  }, [eventId]);
  useEffect(() => { if (event && autoPrint) window.setTimeout(() => window.print(), 250); }, [event, autoPrint]);
  useEffect(() => {
    let active = true;
    const loadWorkspace = () => fetch(`/api/events/${eventId}/workspace`, { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setWorkspaceData(data); }).catch(() => undefined);
    void loadWorkspace();
    const timer = window.setInterval(loadWorkspace, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [eventId]);

  const eventDate = useMemo(() => event ? new Date(event.starts_at).toLocaleString() : "", [event]);
  if (loading) return <main className="min-h-screen bg-background p-6"><p className="mx-auto max-w-6xl text-sm text-muted-foreground">Loading event workspace…</p></main>;
  if (!event) return <main className="min-h-screen bg-background p-6"><div className="mx-auto max-w-6xl space-y-4"><p className="text-sm text-destructive">Event not found.</p><Button asChild variant="outline"><Link href="/events"><ArrowLeft data-icon="inline-start" />Back to events</Link></Button></div></main>;

  return <main className="min-h-screen bg-background p-4 text-foreground md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between"><div className="space-y-2"><Button asChild variant="ghost" className="px-0"><Link href="/events"><ArrowLeft data-icon="inline-start" />Back to events</Link></Button><p className="text-sm font-medium text-primary">Event workspace</p><h1 className="text-3xl font-bold tracking-tight">{event.name}</h1><p className="text-sm text-muted-foreground">{event.client_name} · {event.venue}</p></div><div className="flex items-center gap-3"><Badge variant="secondary">{labels[event.status] ?? event.status}</Badge><Button asChild variant="outline"><Link href={`/events/${event.id}?print=mock`}><Printer data-icon="inline-start" />Print receipt</Link></Button><Button>Next action</Button></div></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Date</p><p className="mt-1 font-semibold">{eventDate}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Venue</p><p className="mt-1 font-semibold">{event.venue}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Guests</p><p className="mt-1 flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" />{event.guest_count}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payment</p><p className="mt-1 font-semibold text-muted-foreground">{event.payment_status === "paid" ? "Paid" : event.payment_status === "partially_paid" ? "Partially paid" : "Unpaid"}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Booking</p><p className="mt-1 font-semibold">{event.receipt_id ? "Secured" : "Needs quote"}</p></CardContent></Card></section>
    <nav className="flex gap-2 overflow-x-auto border-b border-border pb-2" aria-label="Event workspace sections">{tabs.map(({ id, label, icon: Icon }) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} className="shrink-0" onClick={() => setTab(id)}><Icon data-icon="inline-start" />{label}</Button>)}</nav>
    <Card><CardHeader><CardTitle>{tabs.find((item) => item.id === tab)?.label}</CardTitle></CardHeader><CardContent className="space-y-4">
      {tab === "overview" && <><p className="text-sm leading-6 text-muted-foreground">Keep client, schedule, venue, guest requirements, and the next operational action visible here.</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border p-4"><p className="text-sm font-medium">Client contact</p><p className="mt-1 text-sm text-muted-foreground">{event.client_name}</p></div><div className="rounded-2xl border border-border p-4"><p className="text-sm font-medium">Coordinator</p><p className="mt-1 text-sm text-muted-foreground">Unassigned</p></div></div><div className="grid gap-4 md:grid-cols-2"><Card className="border-primary/30 bg-primary/5"><CardHeader><CardTitle>Pricing desk</CardTitle><p className="text-sm text-muted-foreground">Build and review the quote for this event.</p></CardHeader><CardContent><Button asChild><Link href={`/events?eventId=${event.id}#pricing`}>Open pricing desk</Link></Button></CardContent></Card><Card className="border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"><CardHeader><CardTitle>Secure venue and services</CardTitle><p className="text-sm text-muted-foreground">Secure an approved quote and post the receipt.</p></CardHeader><CardContent><Button asChild><Link href={`/events?eventId=${event.id}#secure`}>Open secure booking</Link></Button></CardContent></Card></div></>}
      {tab === "quote" && <QuoteApprovalPanel eventId={event.id} />}
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
  return <div className="grid gap-4"><div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm leading-6"><p className="font-semibold">Approval control</p><p className="text-muted-foreground">Approved quotes are locked. Changes must be made as a new quote version; only the current approved version can secure the event.</p><Button className="mt-3" size="sm" asChild><Link href={`/events?eventId=${eventId}#pricing`}>Create new quote version</Link></Button></div>{quotes.map((quote) => { const locked = ["approved", "sent", "accepted", "superseded"].includes(quote.status); return <div key={quote.id} className={`rounded-2xl border p-4 ${locked ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20" : "border-border"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Quote {quote.id.slice(0, 8).toUpperCase()}</p><p className="text-sm text-muted-foreground">Created {new Date(quote.created_at).toLocaleString()} · {quote.items.length} line item{quote.items.length === 1 ? "" : "s"}</p></div><Badge variant={quote.status === "approved" ? "default" : "secondary"}>{quote.status.replace("_", " ")}</Badge></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-lg font-semibold">{Number(quote.total).toFixed(2)} {quote.currency ?? "GHS"}</p><div className="flex flex-wrap gap-2">{quote.status === "draft" && <Button size="sm" onClick={() => transition(quote.id, "pending_approval")} disabled={busy === quote.id}>Submit for approval</Button>}{quote.status === "pending_approval" && <Button size="sm" onClick={() => transition(quote.id, "approved")} disabled={busy === quote.id}>Approve quote</Button>}{quote.status === "approved" && <Button size="sm" asChild><Link href={`/events?eventId=${eventId}#secure`}>Secure this quote</Link></Button>}{locked && <span className="self-center text-xs text-muted-foreground">Locked version</span>}</div></div></div>;})}</div>;
}

function EventFinanceTab({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<Array<{ id: string; amount: string; direction: string; status: string; occurred_at: string; payment_method?: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/events/${eventId}/finance`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setEntries(data.entries ?? []))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading finance entries…</p>;
  if (!entries.length) return <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No event ledger entries have been posted.</div>;
  return <div className="grid gap-3">{entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"><div><p className="font-medium">{entry.direction === "debit" ? "Debit" : "Credit"}</p><p className="text-sm text-muted-foreground">{new Date(entry.occurred_at).toLocaleString()} · {entry.status}</p></div><p className="font-semibold">{entry.amount} GHS</p></div>)}</div>;
}

export default EventDetailWorkspace;
