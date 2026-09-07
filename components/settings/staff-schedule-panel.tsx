"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, Check, ChevronDown, Loader2, Plus } from "lucide-react";

interface Schedule { id: string; name: string; job_classification: string; department: string; start_time: string; end_time: string; reminder_minutes: number }

const DEPARTMENTS = ["Hotel", "Restaurant", "Operations"];
const CLASSIFICATIONS = ["Reception", "Restaurant Front Desk / POS", "Waiter/Waitress", "Chef", "Housekeeping", "Security", "Labour", "Other"];

function SearchableScheduleCombobox({ id, label, value, options, placeholder, onChange }: { id: string; label: string; value: string; options: string[]; placeholder: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const matches = options.filter((option) => option.toLowerCase().includes(value.toLowerCase()));
  return <div className="relative"><Label htmlFor={id}>{label}</Label><div className="relative"><Input id={id} required value={value} placeholder={placeholder} autoComplete="off" onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)} /><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></div>{open && <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-border bg-background p-1 shadow-lg" role="listbox">{matches.length ? matches.map((option) => <button type="button" key={option} role="option" aria-selected={value === option} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option); setOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">{option}{value === option && <Check className="h-4 w-4" aria-hidden="true" />}</button>) : <p className="px-3 py-2 text-sm text-muted-foreground">No matching existing options.</p>}</div>}</div>;
}

export function StaffSchedulePanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", department: "", jobClassification: "", startTime: "08:00", endTime: "17:00", reminderMinutes: "20" });
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/work-schedules", { cache: "no-store" });
    if (response.ok) setSchedules((await response.json()).schedules ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function createSchedule(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/admin/work-schedules", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingId ? { ...form, id: editingId } : form) });
    if (response.ok) { setForm({ name: "", department: "", jobClassification: "", startTime: "08:00", endTime: "17:00", reminderMinutes: "20" }); setEditingId(null); await load(); }
    setSaving(false);
  }

  return <Card className="border-orange-200 bg-white/70 shadow-xl dark:border-orange-700 dark:bg-gray-800/70"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-orange-600" />Staff time schedules</CardTitle><CardDescription>Set department and role defaults used by the Attendance Register. Existing attendance records are never recalculated.</CardDescription></CardHeader><CardContent className="grid gap-6"><form onSubmit={createSchedule} className="grid gap-4 rounded-2xl border border-orange-200 p-4 md:grid-cols-2"><div className="md:col-span-2"><Label htmlFor="schedule-name">Schedule name</Label><Input id="schedule-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kitchen weekday schedule" /></div><SearchableScheduleCombobox id="schedule-department" label="Department" value={form.department} options={DEPARTMENTS} placeholder="Search departments" onChange={(department) => setForm({ ...form, department })} /><SearchableScheduleCombobox id="schedule-role" label="Role or classification" value={form.jobClassification} options={CLASSIFICATIONS} placeholder="Search roles or classifications" onChange={(jobClassification) => setForm({ ...form, jobClassification })} /><div><Label htmlFor="schedule-start">Check-in time</Label><Input id="schedule-start" required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div><div><Label htmlFor="schedule-end">Check-out time</Label><Input id="schedule-end" required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div><div><Label htmlFor="schedule-reminder">Reminder minutes</Label><Input id="schedule-reminder" type="number" min="0" max="180" value={form.reminderMinutes} onChange={(e) => setForm({ ...form, reminderMinutes: e.target.value })} /></div><div className="flex items-end"><Button disabled={saving} type="submit">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add schedule</Button></div></form><div className="grid gap-3">{loading ? <p className="text-sm text-muted-foreground">Loading schedules...</p> : schedules.length === 0 ? <p className="text-sm text-muted-foreground">No schedules configured yet.</p> : schedules.map((schedule) => <div key={schedule.id} className="flex flex-col gap-2 rounded-2xl border border-orange-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{schedule.name}</p><p className="text-sm text-muted-foreground">{schedule.department} · {schedule.job_classification}</p></div><p className="text-sm font-medium">{schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)} <span className="font-normal text-muted-foreground">· reminder {schedule.reminder_minutes} min</span></p></div>)}</div></CardContent></Card>;
}
