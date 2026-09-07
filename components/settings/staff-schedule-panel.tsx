"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, Loader2, Plus } from "lucide-react";

interface Schedule { id: string; name: string; job_classification: string; department: string; start_time: string; end_time: string; reminder_minutes: number }

export function StaffSchedulePanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", department: "", jobClassification: "", startTime: "08:00", endTime: "17:00", reminderMinutes: "20" });

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
    const response = await fetch("/api/admin/work-schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (response.ok) { setForm({ name: "", department: "", jobClassification: "", startTime: "08:00", endTime: "17:00", reminderMinutes: "20" }); await load(); }
    setSaving(false);
  }

  return <Card className="border-orange-200 bg-white/70 shadow-xl dark:border-orange-700 dark:bg-gray-800/70"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-orange-600" />Staff time schedules</CardTitle><CardDescription>Set department and role defaults used by the Attendance Register. Existing attendance records are never recalculated.</CardDescription></CardHeader><CardContent className="grid gap-6"><form onSubmit={createSchedule} className="grid gap-4 rounded-2xl border border-orange-200 p-4 md:grid-cols-2"><div className="md:col-span-2"><Label htmlFor="schedule-name">Schedule name</Label><Input id="schedule-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kitchen weekday schedule" /></div><div><Label htmlFor="schedule-department">Department</Label><Input id="schedule-department" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Restaurant" /></div><div><Label htmlFor="schedule-role">Role or classification</Label><Input id="schedule-role" required value={form.jobClassification} onChange={(e) => setForm({ ...form, jobClassification: e.target.value })} placeholder="Chef" /></div><div><Label htmlFor="schedule-start">Check-in time</Label><Input id="schedule-start" required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div><div><Label htmlFor="schedule-end">Check-out time</Label><Input id="schedule-end" required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div><div><Label htmlFor="schedule-reminder">Reminder minutes</Label><Input id="schedule-reminder" type="number" min="0" max="180" value={form.reminderMinutes} onChange={(e) => setForm({ ...form, reminderMinutes: e.target.value })} /></div><div className="flex items-end"><Button disabled={saving} type="submit">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add schedule</Button></div></form><div className="grid gap-3">{loading ? <p className="text-sm text-muted-foreground">Loading schedules...</p> : schedules.length === 0 ? <p className="text-sm text-muted-foreground">No schedules configured yet.</p> : schedules.map((schedule) => <div key={schedule.id} className="flex flex-col gap-2 rounded-2xl border border-orange-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{schedule.name}</p><p className="text-sm text-muted-foreground">{schedule.department} · {schedule.job_classification}</p></div><p className="text-sm font-medium">{schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)} <span className="font-normal text-muted-foreground">· reminder {schedule.reminder_minutes} min</span></p></div>)}</div></CardContent></Card>;
}
