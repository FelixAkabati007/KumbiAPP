"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Clock3, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleGuard } from "@/components/role-guard";

interface Ticket { id: string; ticket_number: string; room_number?: string; issue_description: string; severity: string; status: string; assigned_to_name?: string; created_at: string; }

function OperationsWorkspace() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/hotels/maintenance${status === "all" ? "" : `?status=${encodeURIComponent(status)}`}`);
      if (response.ok) setTickets(await response.json());
      setLoading(false);
    };
    load();
  }, [status]);

  const stats = useMemo(() => ({
    open: tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
    urgent: tickets.filter((t) => ["urgent", "high"].includes(t.severity) && !["resolved", "closed"].includes(t.status)).length,
    assigned: tickets.filter((t) => t.assigned_to_name).length,
    resolved: tickets.filter((t) => ["resolved", "closed"].includes(t.status)).length,
  }), [tickets]);

  const statCards: Array<{ label: string; value: number; Icon: typeof Wrench }> = [["Open issues", stats.open, Wrench], ["Urgent or high", stats.urgent, AlertTriangle], ["Assigned", stats.assigned, Clock3], ["Resolved", stats.resolved, CheckCircle2]].map(([label, value, Icon]) => ({ label: String(label), value: Number(value), Icon: Icon as typeof Wrench }));

  return <main className="min-h-screen bg-background p-4 md:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm font-medium text-primary">Operations control</p><h1 className="text-3xl font-semibold tracking-tight">Technical Operations</h1><p className="mt-2 max-w-2xl text-muted-foreground">Coordinate maintenance issues across hotel and restaurant operations. Escalate business-impacting issues to the General Manager or Admin.</p></div>
        <div className="flex items-center gap-3"><Badge variant="outline">Reports to General Manager</Badge><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue placeholder="Filter status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select></div>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Operations summary">
        {statCards.map(({ label, value, Icon }) => <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><Icon className="size-5 text-primary" aria-hidden="true" /></CardContent></Card>)}
      </section>
      <Card><CardHeader><CardTitle>Maintenance queue</CardTitle></CardHeader><CardContent>{loading ? <p className="py-10 text-center text-muted-foreground">Loading maintenance issues…</p> : tickets.length === 0 ? <p className="py-10 text-center text-muted-foreground">No maintenance issues match this filter.</p> : <div className="space-y-3">{tickets.map((ticket) => <article key={ticket.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"><div className="flex gap-3"><Building2 className="mt-1 size-5 text-muted-foreground" aria-hidden="true" /><div><p className="font-medium">{ticket.ticket_number} · {ticket.room_number ? `Room ${ticket.room_number}` : "Restaurant / shared area"}</p><p className="text-sm text-muted-foreground">{ticket.issue_description}</p><p className="mt-1 text-xs text-muted-foreground">Created {new Date(ticket.created_at).toLocaleDateString()} · {ticket.assigned_to_name ? `Assigned to ${ticket.assigned_to_name}` : "Unassigned"}</p></div></div><div className="flex items-center gap-2"><Badge variant={ticket.severity === "urgent" ? "destructive" : "secondary"}>{ticket.severity}</Badge><Badge variant="outline">{ticket.status.replace("_", " ")}</Badge></div></article>)}</div>}</CardContent></Card>
    </div>
  </main>;
}

export default function OperationsPage() { return <RoleGuard section="operations"><OperationsWorkspace /></RoleGuard>; }
