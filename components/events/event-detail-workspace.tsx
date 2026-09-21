"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, FileText, IndianRupee, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EventRecord = { id: string; name: string; client_name: string; venue: string; starts_at: string; ends_at?: string | null; guest_count: number; status: string; payment_status?: string; receipt_id?: string | null; quote_approved?: boolean; finance_posted?: boolean };
type Tab = "overview" | "quote" | "payments" | "operations" | "documents" | "activity";

const labels: Record<string, string> = { planning: "Planning", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "overview", label: "Overview", icon: CalendarDays },
  { id: "quote", label: "Quote", icon: FileText },
  { id: "payments", label: "Payments", icon: IndianRupee },
  { id: "operations", label: "Operations", icon: ClipboardList },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "activity", label: "Activity", icon: CheckCircle2 },
];

export function EventDetailWorkspace({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" }).then((response) => response.json()).then((data) => setEvent((data.events ?? []).find((item: EventRecord) => item.id === eventId) ?? null)).finally(() => setLoading(false));
  }, [eventId]);

  const eventDate = useMemo(() => event ? new Date(event.starts_at).toLocaleString() : "", [event]);
  if (loading) return <main className="min-h-screen bg-background p-6"><p className="mx-auto max-w-6xl text-sm text-muted-foreground">Loading event workspace…</p></main>;
  if (!event) return <main className="min-h-screen bg-background p-6"><div className="mx-auto max-w-6xl space-y-4"><p className="text-sm text-destructive">Event not found.</p><Button asChild variant="outline"><Link href="/events"><ArrowLeft data-icon="inline-start" />Back to events</Link></Button></div></main>;

  return <main className="min-h-screen bg-background p-4 text-foreground md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between"><div className="space-y-2"><Button asChild variant="ghost" className="px-0"><Link href="/events"><ArrowLeft data-icon="inline-start" />Back to events</Link></Button><p className="text-sm font-medium text-primary">Event workspace</p><h1 className="text-3xl font-bold tracking-tight">{event.name}</h1><p className="text-sm text-muted-foreground">{event.client_name} · {event.venue}</p></div><div className="flex items-center gap-3"><Badge variant="secondary">{labels[event.status] ?? event.status}</Badge><Button>Next action</Button></div></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Date</p><p className="mt-1 font-semibold">{eventDate}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Venue</p><p className="mt-1 font-semibold">{event.venue}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Guests</p><p className="mt-1 flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" />{event.guest_count}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payment</p><p className="mt-1 font-semibold text-muted-foreground">{event.payment_status === "paid" ? "Paid" : event.payment_status === "partially_paid" ? "Partially paid" : "Unpaid"}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Booking</p><p className="mt-1 font-semibold">{event.receipt_id ? "Secured" : "Needs quote"}</p></CardContent></Card></section>
    <nav className="flex gap-2 overflow-x-auto border-b border-border pb-2" aria-label="Event workspace sections">{tabs.map(({ id, label, icon: Icon }) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} className="shrink-0" onClick={() => setTab(id)}><Icon data-icon="inline-start" />{label}</Button>)}</nav>
    <Card><CardHeader><CardTitle>{tabs.find((item) => item.id === tab)?.label}</CardTitle></CardHeader><CardContent className="space-y-4">
      {tab === "overview" && <><p className="text-sm leading-6 text-muted-foreground">Keep client, schedule, venue, guest requirements, and the next operational action visible here.</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border p-4"><p className="text-sm font-medium">Client contact</p><p className="mt-1 text-sm text-muted-foreground">{event.client_name}</p></div><div className="rounded-2xl border border-border p-4"><p className="text-sm font-medium">Coordinator</p><p className="mt-1 text-sm text-muted-foreground">Unassigned</p></div></div></>}
      {tab === "quote" && <><p className="text-sm text-muted-foreground">Create, approve, and lock quote versions before confirmation.</p><Button asChild><Link href="/events">Open pricing desk</Link></Button></>}
      {tab === "payments" && <><p className="text-sm text-muted-foreground">Payment tracking is separated from event status so confirmed events can be unpaid or partially paid.</p><div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No payments recorded yet.</div></>}
      {tab === "operations" && <><p className="text-sm text-muted-foreground">Track setup, catering, staffing, equipment, and teardown tasks.</p><Button variant="outline">Add operational task</Button></>}
      {tab === "documents" && <><p className="text-sm text-muted-foreground">Shared document templates should produce quotes, confirmations, invoices, and receipts.</p><div className="flex flex-wrap gap-2"><Button variant="outline">Booking confirmation</Button><Button variant="outline">Invoice</Button><Button variant="outline">Receipt</Button></div></>}
      {tab === "activity" && <><p className="text-sm text-muted-foreground">Every status, quote, payment, print, and cancellation action should be recorded.</p><div className="rounded-2xl border border-border p-4 text-sm">Event created · Activity history will appear here as actions are recorded.</div></>}
    </CardContent></Card>
  </div></main>;
}

export default EventDetailWorkspace;
