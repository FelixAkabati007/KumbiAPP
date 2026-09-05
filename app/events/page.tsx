"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Plus, Users, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RoleGuard } from "@/components/role-guard";

type EventRecord = { id: string; name: string; client_name: string; venue: string; starts_at: string; guest_count: number; status: string };

const statusLabels: Record<string, string> = { planning: "Planning", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed" };

function EventsWorkspace() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadEvents() {
    setLoading(true);
    const response = await fetch("/api/events");
    if (response.ok) setEvents((await response.json()).events ?? []);
    setLoading(false);
  }

  useEffect(() => { void loadEvents(); }, []);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), clientName: form.get("clientName"), venue: form.get("venue"), startsAt: form.get("startsAt"), guestCount: form.get("guestCount") }) });
    if (response.ok) { setShowForm(false); event.currentTarget.reset(); await loadEvents(); }
    else setMessage((await response.json()).error ?? "Unable to create event");
    setSaving(false);
  }

  const summary = useMemo(() => ({ upcoming: events.filter((item) => new Date(item.starts_at) >= new Date()).length, planning: events.filter((item) => item.status === "planning").length, guests: events.reduce((sum, item) => sum + Number(item.guest_count), 0) }), [events]);
  const cards = [{ label: "Upcoming events", value: summary.upcoming, icon: CalendarDays }, { label: "Active planning", value: summary.planning, icon: ClipboardList }, { label: "Total guests", value: summary.guests, icon: Users }, { label: "Confirmed menus", value: "—", icon: Utensils }];

  return <main className="min-h-screen bg-background p-3 pt-5 sm:p-4 md:p-8 md:pt-6"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between"><div className="space-y-2"><p className="text-sm font-medium text-primary">Operations workspace</p><h1 className="text-3xl font-bold tracking-tight text-foreground">Event Organization</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Coordinate event planning, venues, timelines, and assigned teams from one operational view.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button asChild variant="outline" className="min-h-10 rounded-2xl"><Link href="/"><ArrowLeft data-icon="inline-start" />Back to Dashboard</Link></Button><Button className="min-h-10 rounded-2xl" onClick={() => setShowForm((open) => !open)}><Plus data-icon="inline-start" />{showForm ? "Close form" : "Create event"}</Button></div></header>
    {showForm && <Card className="rounded-3xl border-border bg-card shadow-sm"><CardHeader><CardTitle>Create event</CardTitle></CardHeader><CardContent><form onSubmit={createEvent} className="grid gap-4 sm:grid-cols-2"><Input name="name" placeholder="Event name" required /><Input name="clientName" placeholder="Client name" required /><Input name="venue" placeholder="Venue" required /><Input name="startsAt" type="datetime-local" required /><Input name="guestCount" type="number" min="0" placeholder="Guest count" required /><div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save event"}</Button>{message && <p className="text-sm text-destructive">{message}</p>}</div></form></CardContent></Card>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Event organization summary">{cards.map(({ label, value, icon: Icon }) => <Card key={label} className="rounded-3xl border-border bg-card shadow-sm"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold text-foreground">{value}</p></div><Icon className="size-5 text-primary" aria-hidden="true" /></CardContent></Card>)}</section>
    <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]"><Card className="rounded-3xl border-border bg-card shadow-sm"><CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border"><div><CardTitle>Upcoming events</CardTitle><p className="mt-1 text-sm text-muted-foreground">Plan dates, venues, guests, and delivery teams.</p></div><Badge variant="outline">{events.length} total</Badge></CardHeader><CardContent className="space-y-3 p-5">{loading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading events…</p> : events.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><div className="rounded-2xl bg-muted p-3"><CalendarDays className="size-6 text-primary" aria-hidden="true" /></div><div><h2 className="font-semibold text-foreground">No events scheduled</h2><p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Create an event to start coordinating dates, venues, guests, and staff assignments.</p></div></div> : events.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-foreground">{item.name}</h2><p className="text-sm text-muted-foreground">{item.client_name} · {item.venue} · {item.guest_count} guests</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.starts_at).toLocaleString()}</p></div><Badge variant="secondary">{statusLabels[item.status] ?? item.status}</Badge></article>)}</CardContent></Card>
    <Card className="rounded-3xl border-border bg-card shadow-sm"><CardHeader><CardTitle>Event readiness</CardTitle><p className="text-sm text-muted-foreground">Operational checks for each event.</p></CardHeader><CardContent className="space-y-3">{["Venue confirmed", "Menu approved", "Team assigned", "Timeline published"].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl border border-border p-3 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />{item}<Badge className="ml-auto" variant="secondary">Pending</Badge></div>)}</CardContent></Card></section>
  </div></main>;
}

export default function EventsPage() { return <RoleGuard section="events"><EventsWorkspace /></RoleGuard>; }
