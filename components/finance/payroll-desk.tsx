"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, RefreshCw, Users } from "lucide-react";

type Staff = { id: string; first_name: string; last_name: string; position?: string };
type Profile = { id: string; staff_profile_id: string; first_name: string; last_name: string; pay_frequency: string; base_amount: string; allowances: string; default_deductions: string; effective_from: string };
type RecordItem = { id: string; first_name: string; last_name: string; pay_period_start: string; pay_period_end: string; gross_amount: string; deductions: string; net_amount: string; status: string };

const money = (value: string | number) => `GHS ${Number(value || 0).toFixed(2)}`;

export function PayrollDesk() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [period, setPeriod] = useState({ start: new Date().toISOString().slice(0, 8) + "01", end: new Date().toISOString().slice(0, 10) });
  const [form, setForm] = useState({ staffProfileId: "", payFrequency: "monthly", baseAmount: "", allowances: "0", defaultDeductions: "0", effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const response = await fetch("/api/payroll", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to load payroll data.");
      setProfiles(data.profiles ?? []); setRecords(data.records ?? []); setStaff(data.staff ?? []);
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to load payroll data." }); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage(null);
    const response = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "profile", ...form, baseAmount: Number(form.baseAmount), allowances: Number(form.allowances), defaultDeductions: Number(form.defaultDeductions) }) });
    const data = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setMessage({ kind: "error", text: data.error ?? "Unable to save compensation profile." }); return; }
    setMessage({ kind: "success", text: "Compensation profile saved. The previous active version was preserved." }); setForm((current) => ({ ...current, baseAmount: "", allowances: "0", defaultDeductions: "0" })); void load();
  };

  const generate = async () => {
    setGenerating(true); setMessage(null);
    const response = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "generate", payPeriodStart: period.start, payPeriodEnd: period.end }) });
    const data = await response.json().catch(() => ({})); setGenerating(false);
    setMessage(response.ok ? { kind: "success", text: `${data.created ?? 0} draft payroll record(s) prepared. Existing periods were not duplicated.` } : { kind: "error", text: data.error ?? "Unable to prepare payroll." });
    if (response.ok) void load();
  };

  const updateStatus = async (id: string, status: string) => {
    const response = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "status", id, status }) });
    if (!response.ok) { setMessage({ kind: "error", text: "Unable to update payroll status." }); return; }
    setMessage({ kind: "success", text: `Payroll marked ${status}.` }); void load();
  };

  const monthlyTotal = useMemo(() => profiles.reduce((sum, item) => sum + Number(item.base_amount) + Number(item.allowances) - Number(item.default_deductions), 0), [profiles]);

  return <Card className="rounded-xl border bg-card shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" aria-hidden="true" /> Payroll & compensation</CardTitle><p className="text-sm text-muted-foreground">Manage recurring profiles, prepare draft payroll, and review approval status.</p></CardHeader><CardContent className="space-y-6">
    {message && <Alert variant={message.kind === "error" ? "destructive" : "default"}><div>{message.kind === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><AlertTitle>{message.kind === "error" ? "Payroll action failed" : "Payroll updated"}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert>}
    <form onSubmit={save} className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3"><div className="space-y-2"><Label>Staff member</Label><Select value={form.staffProfileId} onValueChange={(value) => setForm((current) => ({ ...current, staffProfileId: value }))}><SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger><SelectContent>{staff.map((person) => <SelectItem key={person.id} value={person.id}>{person.first_name} {person.last_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Pay frequency</Label><Select value={form.payFrequency} onValueChange={(value) => setForm((current) => ({ ...current, payFrequency: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="biweekly">Biweekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Effective from</Label><Input type="date" value={form.effectiveFrom} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></div><div className="space-y-2"><Label>Base amount (GHS)</Label><Input type="number" min="0" step="0.01" required value={form.baseAmount} onChange={(event) => setForm((current) => ({ ...current, baseAmount: event.target.value }))} /></div><div className="space-y-2"><Label>Allowances (GHS)</Label><Input type="number" min="0" step="0.01" value={form.allowances} onChange={(event) => setForm((current) => ({ ...current, allowances: event.target.value }))} /></div><div className="space-y-2"><Label>Default deductions (GHS)</Label><Input type="number" min="0" step="0.01" value={form.defaultDeductions} onChange={(event) => setForm((current) => ({ ...current, defaultDeductions: event.target.value }))} /></div><div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={saving || !form.staffProfileId}>{saving ? "Saving..." : "Save compensation profile"}</Button></div></form>
    <section className="space-y-3" aria-labelledby="profiles-heading"><div className="flex items-center justify-between"><div><h3 id="profiles-heading" className="font-semibold">Active compensation profiles</h3><p className="text-sm text-muted-foreground">Estimated recurring net pay: {money(monthlyTotal)}</p></div><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button></div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Staff</th><th className="p-3">Frequency</th><th className="p-3">Base</th><th className="p-3">Allowances</th><th className="p-3">Deductions</th><th className="p-3">Est. net</th><th className="p-3">Effective</th></tr></thead><tbody>{profiles.length ? profiles.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-medium">{item.first_name} {item.last_name}</td><td className="p-3 capitalize">{item.pay_frequency}</td><td className="p-3">{money(item.base_amount)}</td><td className="p-3">{money(item.allowances)}</td><td className="p-3">{money(item.default_deductions)}</td><td className="p-3">{money(Number(item.base_amount) + Number(item.allowances) - Number(item.default_deductions))}</td><td className="p-3">{item.effective_from}</td></tr>) : <tr><td className="p-4 text-muted-foreground" colSpan={7}>No active compensation profiles yet.</td></tr>}</tbody></table></div></section>
    <section className="space-y-3" aria-labelledby="prepare-payroll-heading"><div><h3 id="prepare-payroll-heading" className="font-semibold">Prepare payroll period</h3><p className="text-sm text-muted-foreground">Creates draft records from active profiles without duplicating an existing period.</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="space-y-2"><Label>Period start</Label><Input type="date" value={period.start} onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))} /></div><div className="space-y-2"><Label>Period end</Label><Input type="date" value={period.end} onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))} /></div><Button onClick={() => void generate()} disabled={generating || !profiles.length}>{generating ? "Preparing..." : "Prepare draft payroll"}</Button></div></section>
    <section className="space-y-3" aria-labelledby="records-heading"><h3 id="records-heading" className="font-semibold">Payroll records</h3><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Staff</th><th className="p-3">Period</th><th className="p-3">Gross</th><th className="p-3">Deductions</th><th className="p-3">Net</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{records.length ? records.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-medium">{item.first_name} {item.last_name}</td><td className="p-3">{item.pay_period_start} – {item.pay_period_end}</td><td className="p-3">{money(item.gross_amount)}</td><td className="p-3">{money(item.deductions)}</td><td className="p-3">{money(item.net_amount)}</td><td className="p-3 capitalize">{item.status}</td><td className="p-3"><Select value={item.status} onValueChange={(value) => void updateStatus(item.id, value)}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent>{["draft", "submitted", "approved", "paid", "rejected"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></td></tr>) : <tr><td className="p-4 text-muted-foreground" colSpan={7}>No payroll records prepared yet.</td></tr>}</tbody></table></div></section>
  </CardContent></Card>;
}
