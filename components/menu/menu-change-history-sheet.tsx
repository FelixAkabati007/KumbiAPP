"use client";

import { useState } from "react";
import { Download, History, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

type Event = { id: string; event_type: string; before_snapshot: Record<string, unknown>; after_snapshot: Record<string, unknown>; changed_fields: string[]; reason?: string | null; staff_id: string; staff_name: string; staff_role: string; correlation_id: string; idempotency_key: string; created_at: string };

function formatSnapshot(snapshot: Record<string, unknown>) { return Object.entries(snapshot).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n"); }

export function MenuChangeHistorySheet({ menuItemId, menuItemName }: { menuItemId: string; menuItemName: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const load = async () => { setLoading(true); try { const response = await fetch(`/api/menu/${menuItemId}/change-history`, { cache: "no-store" }); const data = await response.json(); if (response.ok) setEvents(data.events || []); } finally { setLoading(false); } };
  const exportHistory = () => { window.location.href = `/api/menu/${menuItemId}/change-history?format=xlsx`; };
  return <Sheet onOpenChange={(open) => { if (open && events.length === 0) void load(); }}>
    <SheetTrigger asChild><Button variant="outline" size="sm" className="gap-2"><History className="size-4" /> Change history</Button></SheetTrigger>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader><SheetTitle>{menuItemName} change history</SheetTitle><SheetDescription>Immutable Neon-backed before and after records for management review.</SheetDescription></SheetHeader>
      <div className="mt-5 flex justify-end"><Button variant="secondary" size="sm" onClick={exportHistory} className="gap-2"><Download className="size-4" /> Download Excel</Button></div>
      <div className="mt-5 flex flex-col gap-3">{loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading history…</div>}{!loading && events.length === 0 && <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No recorded menu changes yet.</p>}{events.map((event) => { const expanded = openEvent === event.id; return <article key={event.id} className="rounded-xl border p-4"><button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpenEvent(expanded ? null : event.id)}><span><span className="flex items-center gap-2 font-medium">{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}{event.event_type.replaceAll("_", " ")}</span><span className="mt-1 block text-xs text-muted-foreground">{event.staff_name} · {event.staff_role} · {new Date(event.created_at).toLocaleString()}</span></span><Badge variant="outline">{event.changed_fields?.length || 0} fields</Badge></button>{expanded && <div className="mt-4 grid gap-3 text-xs"><p><strong>Staff ID:</strong> {event.staff_id}</p><p><strong>Reason:</strong> {event.reason || "Not supplied"}</p><div className="grid gap-3 sm:grid-cols-2"><pre className="whitespace-pre-wrap rounded-lg bg-muted p-3"><strong>Before</strong>{`\n${formatSnapshot(event.before_snapshot) || "No previous value"}`}</pre><pre className="whitespace-pre-wrap rounded-lg bg-muted p-3"><strong>After</strong>{`\n${formatSnapshot(event.after_snapshot) || "No new value"}`}</pre></div><p className="break-all text-muted-foreground">Correlation: {event.correlation_id}<br />Idempotency: {event.idempotency_key}</p></div>}</article>; })}</div>
    </SheetContent>
  </Sheet>;
}
