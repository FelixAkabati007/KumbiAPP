"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, Clock3, Wrench } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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

  return <main className="min-h-screen space-y-4 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 p-3 pt-5 sm:p-4 md:p-8 md:pt-6 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-orange-200 pb-6 md:flex-row md:items-end md:justify-between dark:border-orange-700">
        <div><p className="text-sm font-medium text-orange-600 dark:text-orange-400">Operations control</p><h1 className="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-200">Technical Operations</h1><p className="mt-2 max-w-2xl text-muted-foreground">Coordinate maintenance issues across hotel and restaurant operations. Escalate business-impacting issues to the General Manager or Admin.</p></div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center"><Button asChild variant="outline" className="w-full rounded-2xl border-orange-200 bg-white/70 dark:border-orange-700 dark:bg-gray-800/70 sm:w-auto"><Link href="/"><ArrowLeft data-icon="inline-start" />Back to Dashboard</Link></Button><Badge variant="outline" className="w-fit">Reports to General Manager</Badge><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Filter status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select></div>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Operations summary">
        {statCards.map(({ label, value, Icon }) => <Card key={label} className="relative overflow-hidden rounded-3xl border border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl dark:border-orange-700 dark:bg-gray-800/70"><div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" /><CardContent className="relative z-10 flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold text-orange-700 dark:text-orange-300">{value}</p></div><Icon className="size-5 text-orange-600 dark:text-orange-400" aria-hidden="true" /></CardContent></Card>)}
      </section>
      <Card className="rounded-3xl border border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm dark:border-orange-700 dark:bg-gray-800/70"><CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10"><CardTitle className="text-gray-800 dark:text-gray-200">Maintenance queue</CardTitle></CardHeader><CardContent>{loading ? <p className="py-10 text-center text-muted-foreground">Loading maintenance issues…</p> : tickets.length === 0 ? <p className="py-10 text-center text-muted-foreground">No maintenance issues match this filter.</p> : <div className="space-y-3">{tickets.map((ticket) => <article key={ticket.id} className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-white/60 p-4 shadow-sm md:flex-row md:items-center md:justify-between dark:border-orange-700 dark:bg-gray-800/50"><div className="flex gap-3"><Building2 className="mt-1 size-5 text-muted-foreground" aria-hidden="true" /><div><p className="font-medium">{ticket.ticket_number} · {ticket.room_number ? `Room ${ticket.room_number}` : "Restaurant / shared area"}</p><p className="text-sm text-muted-foreground">{ticket.issue_description}</p><p className="mt-1 text-xs text-muted-foreground">Created {new Date(ticket.created_at).toLocaleDateString()} · {ticket.assigned_to_name ? `Assigned to ${ticket.assigned_to_name}` : "Unassigned"}</p></div></div><div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0"><Badge variant={ticket.severity === "urgent" ? "destructive" : "secondary"}>{ticket.severity}</Badge><Badge variant="outline">{ticket.status.replace("_", " ")}</Badge></div></article>)}</div>}</CardContent></Card>
    </div>
  </main>;
}

export default function OperationsPage() { return <RoleGuard section="operations"><OperationsWorkspace /></RoleGuard>; }
