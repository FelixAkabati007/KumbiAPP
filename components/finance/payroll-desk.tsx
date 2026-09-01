"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Users } from "lucide-react";

type Staff = { id: string; first_name: string; last_name: string; position?: string };
type Profile = { id: string; staff_profile_id: string; first_name: string; last_name: string; pay_frequency: string; base_amount: string; allowances: string; default_deductions: string };

export function PayrollDesk() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState({ staffProfileId: "", payFrequency: "monthly", baseAmount: "", allowances: "0", defaultDeductions: "0", effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [payrollResponse, staffResponse] = await Promise.all([fetch("/api/payroll", { cache: "no-store" }), fetch("/api/admin/staff", { cache: "no-store" })]);
    if (payrollResponse.ok) { const data = await payrollResponse.json(); setProfiles(data.profiles ?? []); }
    if (staffResponse.ok) { const data = await staffResponse.json(); setStaff(data.staff ?? data ?? []); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage(null);
    const response = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "profile", ...form, baseAmount: Number(form.baseAmount), allowances: Number(form.allowances), defaultDeductions: Number(form.defaultDeductions) }) });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setMessage({ kind: "error", text: data.error ?? "Unable to save compensation profile." }); return; }
    setMessage({ kind: "success", text: "Compensation profile saved successfully." }); setForm((current) => ({ ...current, baseAmount: "", allowances: "0", defaultDeductions: "0" })); void load();
  };

  return <Card className="border-orange-200 bg-card shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" aria-hidden="true" /> Payroll & compensation</CardTitle><p className="text-sm text-muted-foreground">Manage recurring compensation profiles for active staff.</p></CardHeader><CardContent className="space-y-6"><form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div className="space-y-2"><Label htmlFor="payroll-staff">Staff member</Label><Select value={form.staffProfileId} onValueChange={(value) => setForm((current) => ({ ...current, staffProfileId: value }))}><SelectTrigger id="payroll-staff"><SelectValue placeholder="Select staff" /></SelectTrigger><SelectContent>{staff.map((person) => <SelectItem key={person.id} value={person.id}>{person.first_name} {person.last_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="pay-frequency">Pay frequency</Label><Select value={form.payFrequency} onValueChange={(value) => setForm((current) => ({ ...current, payFrequency: value }))}><SelectTrigger id="pay-frequency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="biweekly">Biweekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="base-amount">Base amount (GHS)</Label><Input id="base-amount" type="number" min="0" step="0.01" required value={form.baseAmount} onChange={(event) => setForm((current) => ({ ...current, baseAmount: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="allowances">Allowances (GHS)</Label><Input id="allowances" type="number" min="0" step="0.01" value={form.allowances} onChange={(event) => setForm((current) => ({ ...current, allowances: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="deductions">Default deductions (GHS)</Label><Input id="deductions" type="number" min="0" step="0.01" value={form.defaultDeductions} onChange={(event) => setForm((current) => ({ ...current, defaultDeductions: event.target.value }))} /></div><div className="flex items-end"><Button type="submit" disabled={saving || !form.staffProfileId}>{saving ? "Saving..." : "Save profile"}</Button></div></form>{message && <div role="status" className={`flex items-center gap-2 rounded-md border p-3 text-sm ${message.kind === "error" ? "border-destructive/40 text-destructive" : "border-emerald-500/40 text-emerald-700"}`}>{message.kind === "error" ? <AlertCircle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}{message.text}</div>}<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Staff member</th><th className="p-3">Frequency</th><th className="p-3">Base</th><th className="p-3">Allowances</th><th className="p-3">Deductions</th></tr></thead><tbody>{profiles.map((profile) => <tr key={profile.id} className="border-b last:border-0"><td className="p-3 font-medium">{profile.first_name} {profile.last_name}</td><td className="p-3 capitalize">{profile.pay_frequency}</td><td className="p-3">GHS {Number(profile.base_amount).toFixed(2)}</td><td className="p-3">GHS {Number(profile.allowances).toFixed(2)}</td><td className="p-3">GHS {Number(profile.default_deductions).toFixed(2)}</td></tr>)}</tbody></table>{profiles.length === 0 && <p className="py-4 text-sm text-muted-foreground">No compensation profiles configured.</p>}</div></CardContent></Card>;
}
