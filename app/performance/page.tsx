"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Award, BarChart3, Loader2, Plus, RefreshCw, Users } from "lucide-react";
import Link from "next/link";

type Staff = { staff_id: string; staff_name: string; department: string; points: string; events: number; last_activity: string | null };
type Event = { id: string; points: string; source_type: string; completed_at: string; metadata: { reason?: string; category?: string } | null; staff_name: string; department: string };

export default function PerformancePage() {
  const { toast } = useToast();
  const [data, setData] = useState<{ summary?: { staff_count: number; total_points: string; event_count: number }; staff: Staff[]; eligibleStaff: Staff[]; events: Event[]; scope: string }>({ staff: [], eligibleStaff: [], events: [], scope: "" });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [points, setPoints] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/performance?from=${from}&to=${to}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load performance");
      setData(result);
    } catch (error) {
      toast({ title: "Unable to load performance", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setLoading(false); }
  }, [from, to, toast]);

  useEffect(() => { void load(); }, [load]);

  async function saveAdjustment() {
    setSaving(true);
    try {
      const response = await fetch("/api/performance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId: selectedStaff, points: Number(points), reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save adjustment");
      setOpen(false); setSelectedStaff(""); setReason(""); setPoints("1"); await load();
      toast({ title: "Points recorded", description: "The performance ledger was updated." });
    } catch (error) { toast({ title: "Could not record points", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-muted/20 p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <Link href="/finance" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Finance</Link>
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-medium text-primary">Operations intelligence</p><h1 className="text-3xl font-semibold tracking-tight">Staff Performance</h1><p className="mt-1 text-muted-foreground">Review verified points, recognize strong work, and audit performance over time.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Record points</Button></div></header>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4"><div className="grid gap-1"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div className="grid gap-1"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div><Badge variant="secondary" className="mb-2">Scope: {data.scope || "Loading"}</Badge></div>
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Staff measured</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{data.summary?.staff_count ?? 0}</div><p className="text-xs text-muted-foreground">With verified activity</p></CardContent></Card><Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Verified points</CardTitle><Award className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{Number(data.summary?.total_points ?? 0).toLocaleString()}</div><p className="text-xs text-muted-foreground">Net points in selected period</p></CardContent></Card><Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Ledger events</CardTitle><BarChart3 className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{data.summary?.event_count ?? 0}</div><p className="text-xs text-muted-foreground">Auditable verified events</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Performance ranking</CardTitle><CardDescription>Points are derived from verified events and grouped by department.</CardDescription></CardHeader><CardContent>{loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : <Table><TableHeader><TableRow><TableHead>Staff member</TableHead><TableHead>Department</TableHead><TableHead>Points</TableHead><TableHead>Events</TableHead><TableHead>Last activity</TableHead></TableRow></TableHeader><TableBody>{data.staff.length ? data.staff.map((member) => <TableRow key={member.staff_id}><TableCell className="font-medium">{member.staff_name}</TableCell><TableCell>{member.department}</TableCell><TableCell><Badge variant={Number(member.points) >= 0 ? "default" : "destructive"}>{Number(member.points).toLocaleString()}</Badge></TableCell><TableCell>{member.events}</TableCell><TableCell>{member.last_activity ? new Date(member.last_activity).toLocaleDateString() : "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No verified points in this period.</TableCell></TableRow>}</TableBody></Table>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Recent ledger activity</CardTitle><CardDescription>Every adjustment remains traceable to its source and reason.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Category</TableHead><TableHead>Reason</TableHead><TableHead>Points</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{data.events.map((event) => <TableRow key={event.id}><TableCell>{event.staff_name}</TableCell><TableCell>{event.metadata?.category || event.source_type}</TableCell><TableCell>{event.metadata?.reason || "System verified event"}</TableCell><TableCell className={Number(event.points) < 0 ? "text-destructive" : "text-emerald-600"}>{Number(event.points) > 0 ? "+" : ""}{event.points}</TableCell><TableCell>{new Date(event.completed_at).toLocaleDateString()}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Record performance points</DialogTitle><DialogDescription>Use a clear reason. Positive and negative adjustments are both recorded in the audit ledger.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Staff member</Label><Select value={selectedStaff} onValueChange={setSelectedStaff}><SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger><SelectContent>{data.eligibleStaff.map((member) => <SelectItem value={member.staff_id} key={member.staff_id}>{member.staff_name} · {member.department}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="points">Points</Label><Input id="points" type="number" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="reason">Reason</Label><Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Guest recognition for exceptional service" /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void saveAdjustment()} disabled={saving || !selectedStaff || !reason.trim()}>{saving ? "Saving..." : "Record points"}</Button></DialogFooter></DialogContent></Dialog>
  </div></main>;
}
