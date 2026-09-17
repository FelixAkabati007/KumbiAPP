"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, ShieldCheck } from "lucide-react";

export interface StaffPermissionRow { staff_id: string; staff_name: string; department?: string | null; leave_requests_enabled: boolean; planned_absence_enabled: boolean; attendance_exceptions_enabled: boolean }

type Feature = "leaveRequestsEnabled" | "plannedAbsenceEnabled" | "attendanceExceptionsEnabled";

export function BulkFeaturePermissions({ accounts, onChange }: { accounts: StaffPermissionRow[]; onChange: (rows: StaffPermissionRow[]) => void }) {
  const [department, setDepartment] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const departments = useMemo(() => Array.from(new Set(accounts.map((account) => account.department || "unassigned"))).sort(), [accounts]);
  const visible = department === "all" ? accounts : accounts.filter((account) => (account.department || "unassigned") === department);
  const allVisibleSelected = visible.length > 0 && visible.every((account) => selected.includes(account.staff_id));

  function toggleAll() { setSelected(allVisibleSelected ? selected.filter((id) => !visible.some((account) => account.staff_id === id)) : Array.from(new Set([...selected, ...visible.map((account) => account.staff_id)]))); }
  function toggleOne(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  async function apply(feature?: Feature, value = true) {
    if (!selected.length && department === "all") { setMessage("Select accounts or choose a department first."); return; }
    const label = feature ? feature.replace(/Enabled$/, "").replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).trim() : "all register features";
    if (!window.confirm(`Set ${label} ${value ? "on" : "off"} for ${department !== "all" && !selected.length ? `the ${department} department` : `${selected.length} selected account${selected.length === 1 ? "" : "s"}`}?`)) return;
    setBusy(true); setMessage("");
    const body: Record<string, unknown> = { staffIds: selected, applyToDepartment: !selected.length && department !== "all", department };
    if (feature) body[feature] = value; else Object.assign(body, { leaveRequestsEnabled: value, plannedAbsenceEnabled: value, attendanceExceptionsEnabled: value });
    const response = await fetch("/api/attendance/feature-permissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(data.error || "Unable to update permissions.");
    else { onChange(data.permissions ?? []); setSelected([]); setMessage(`${data.updatedCount ?? 0} account${data.updatedCount === 1 ? "" : "s"} updated.`); }
    setBusy(false);
  }

  return <div className="rounded-2xl border border-border bg-background p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Register feature access</h2></div><p className="mt-1 text-sm text-muted-foreground">Select accounts or apply access to an entire department. Individual settings remain editable below.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void apply(undefined, true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Enable all three</button><button type="button" disabled={busy} onClick={() => void apply(undefined, false)} className="rounded-lg border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-50">Disable all three</button></div></div>
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="relative flex items-center gap-2 text-sm font-semibold">Department<select value={department} onChange={(event) => { setDepartment(event.target.value); setSelected([]); }} className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-9 font-normal"><option value="all">All departments</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-9 h-4 w-4 text-muted-foreground" /></label><div className="flex items-center gap-3 text-sm text-muted-foreground"><span>{selected.length} selected</span><button type="button" onClick={toggleAll} className="font-semibold text-primary">{allVisibleSelected ? "Clear visible" : "Select visible"}</button></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((account) => <label key={account.staff_id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selected.includes(account.staff_id) ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}><input type="checkbox" checked={selected.includes(account.staff_id)} onChange={() => toggleOne(account.staff_id)} className="mt-1 h-4 w-4 accent-primary" /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{account.staff_name}</span><span className="block text-xs text-muted-foreground">{account.department === "unassigned" ? "Unassigned department" : account.department}</span><span className="mt-3 flex flex-wrap gap-1.5 text-[11px]"><span className={`rounded-full px-2 py-1 ${account.leave_requests_enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>Leave {account.leave_requests_enabled ? "on" : "off"}</span><span className={`rounded-full px-2 py-1 ${account.planned_absence_enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>Planned {account.planned_absence_enabled ? "on" : "off"}</span><span className={`rounded-full px-2 py-1 ${account.attendance_exceptions_enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>Exceptions {account.attendance_exceptions_enabled ? "on" : "off"}</span></span></span>{selected.includes(account.staff_id) && <Check className="h-4 w-4 text-primary" />}</label>)}</div>
    {visible.length === 0 && <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">No active staff accounts match this department.</p>}
    {selected.length > 0 && <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4"><p className="text-sm font-semibold">Selected account actions</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><button type="button" disabled={busy} onClick={() => void apply("leaveRequestsEnabled", true)} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">Enable leave</button><button type="button" disabled={busy} onClick={() => void apply("leaveRequestsEnabled", false)} className="rounded-lg border px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50">Disable leave</button><button type="button" disabled={busy} onClick={() => void apply("plannedAbsenceEnabled", true)} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">Enable planned absence</button><button type="button" disabled={busy} onClick={() => void apply("plannedAbsenceEnabled", false)} className="rounded-lg border px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50">Disable planned absence</button><button type="button" disabled={busy} onClick={() => void apply("attendanceExceptionsEnabled", true)} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">Enable exceptions</button><button type="button" disabled={busy} onClick={() => void apply("attendanceExceptionsEnabled", false)} className="rounded-lg border px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50">Disable exceptions</button></div>{busy && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin text-primary" />Saving permission changes…</span>}</div>}
    {message && <p role="status" className="mt-3 text-sm font-medium text-muted-foreground">{message}</p>}
  </div>;
}
