"use client";

import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
type ComplaintMessage = { id: string; message: string; is_internal: boolean; created_at: string };
type Complaint = { id: string; title: string; description: string; department: string; status: string; created_at: string; assignee_role?: string; messages?: ComplaintMessage[] };
const statusLabels: Record<string, string> = { submitted: "Submitted", acknowledged: "Acknowledged", investigating: "Investigating", awaiting_response: "Awaiting response", resolved: "Resolved", escalated: "Escalated", closed: "Closed", reopened: "Reopened" };

export default function ComplaintsPage() {
  const { data, mutate } = useSWR<{ complaints: Complaint[] }>("/api/complaints", fetcher);
  const [form, setForm] = useState({ department: "hotel", subjectType: "operations", title: "", description: "", priority: "normal", confidentiality: "standard" });
  const [busy, setBusy] = useState(false);
  const complaints = data?.complaints ?? [];
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ ...form, title: "", description: "" }); await mutate(); setBusy(false);
  }
  async function update(id: string, status: string, message?: string) {
    await fetch("/api/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status, message }) }); await mutate();
  }
  return <main className="min-h-screen bg-muted/20 p-4 sm:p-6"><div className="mx-auto flex max-w-7xl flex-col gap-6">
    <header><p className="text-sm font-medium text-primary">People and escalation</p><h1 className="text-3xl font-semibold tracking-tight">Complaints &amp; Grievances</h1><p className="mt-1 text-muted-foreground">Submit concerns safely and follow the response from the responsible manager.</p></header>
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <Card><CardHeader><CardTitle>Submit a complaint</CardTitle><CardDescription>Your report is routed by department hierarchy.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label>Department</Label><Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hotel">Hotel</SelectItem><SelectItem value="restaurant">Restaurant</SelectItem><SelectItem value="finance">Finance</SelectItem><SelectItem value="corporate">Corporate</SelectItem></SelectContent></Select></div><div className="flex flex-col gap-2"><Label>Concern type</Label><Select value={form.subjectType} onValueChange={(v) => setForm({ ...form, subjectType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["service","conduct","safety","payroll","operations","other"].map((v) => <SelectItem key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</SelectItem>)}</SelectContent></Select></div><div className="flex flex-col gap-2"><Label htmlFor="complaint-title">Title</Label><Input id="complaint-title" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div className="flex flex-col gap-2"><Label htmlFor="complaint-description">Details</Label><Textarea id="complaint-description" required rows={6} maxLength={10000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><Button disabled={busy} type="submit"><Send data-icon="inline-start" />{busy ? "Submitting..." : "Submit complaint"}</Button></form></CardContent></Card>
      <section className="flex flex-col gap-4"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">My inbox</h2><Badge variant="secondary">{complaints.length} records</Badge></div>{complaints.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center"><CheckCircle2 className="text-primary" /><p className="font-medium">No complaints yet</p><p className="text-sm text-muted-foreground">Submitted concerns and manager responses will appear here.</p></CardContent></Card> : complaints.map((item) => <Card key={item.id}><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="text-base">{item.title}</CardTitle><CardDescription>{item.department} · {new Date(item.created_at).toLocaleString()}</CardDescription></div><Badge variant={item.status === "resolved" || item.status === "closed" ? "secondary" : "outline"}>{statusLabels[item.status] || item.status}</Badge></CardHeader><CardContent className="flex flex-col gap-4"><p className="whitespace-pre-wrap text-sm leading-relaxed">{item.description}</p>{item.messages?.length ? <div className="flex flex-col gap-2 border-t pt-3">{item.messages.filter((m) => !m.is_internal).map((m) => <div key={m.id} className="rounded-lg bg-muted p-3 text-sm"><p>{m.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p></div>)}</div> : null}<div className="flex flex-wrap gap-2">{["manager", "admin"].includes(item.assignee_role ?? "") && <Button size="sm" variant="outline" onClick={() => update(item.id, "acknowledged")}>Acknowledge</Button>}{item.status !== "closed" && <Button size="sm" variant="outline" onClick={() => update(item.id, "resolved", "This complaint has been reviewed.")}>Mark resolved</Button>}</div></CardContent></Card>)}</section>
    </div>
  </div></main>;
}
