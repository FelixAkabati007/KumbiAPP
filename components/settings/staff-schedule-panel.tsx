"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Filter,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Schedule {
  id: string;
  name: string;
  job_classification: string;
  department: string;
  shift_period?: string;
  start_time: string;
  end_time: string;
  reminder_minutes: number;
  is_active?: boolean;
}

const PRESET_DEPARTMENTS = [
  "Hotel",
  "Restaurant",
  "Operations",
  "Hotel & Restaurant",
  "Hotel Operations",
];

const PRESET_CLASSIFICATIONS = [
  "Reception",
  "Restaurant Front Desk / POS",
  "Waiter/Waitress",
  "Chef",
  "Housekeeping",
  "Security",
  "Labour",
  "Staff",
  "Operations",
  "Accounts/Finance",
  "Management",
  "Other",
];

const SHIFT_PERIODS = [
  { value: "standard", label: "Standard shift" },
  { value: "morning", label: "Morning shift" },
  { value: "afternoon", label: "Afternoon shift" },
  { value: "evening", label: "Evening shift" },
  { value: "night", label: "Night shift" },
];

const EMPTY_FORM = {
  name: "",
  department: "Restaurant",
  jobClassification: "Staff",
  shiftPeriod: "standard",
  startTime: "08:00",
  endTime: "17:00",
  reminderMinutes: "20",
};

type ComboProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
};

function SearchableScheduleCombobox({ id, label, value, options, placeholder, onChange }: ComboProps) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    if (!value.trim()) return options;
    return options.filter((option) => option.toLowerCase().includes(value.toLowerCase()));
  }, [options, value]);

  return (
    <div className="relative">
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <div className="relative mt-1">
        <Input
          id={id}
          required
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className="pr-8"
        />
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      {open && (
        <div
          className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-border bg-background p-1 shadow-lg"
          role="listbox"
        >
          {matches.length ? (
            matches.map((option) => (
              <button
                type="button"
                key={option}
                role="option"
                aria-selected={value === option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{option}</span>
                {value === option && <Check className="h-4 w-4 text-orange-600" aria-hidden="true" />}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Press enter to use custom value: &ldquo;{value}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function StaffSchedulePanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [error, setError] = useState("");

  // Filtering state
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/work-schedules", { cache: "no-store" });
    if (response.ok) {
      setSchedules((await response.json()).schedules ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(schedule: Schedule) {
    setEditingId(schedule.id);
    setForm({
      name: schedule.name,
      department: schedule.department,
      jobClassification: schedule.job_classification,
      shiftPeriod: schedule.shift_period || "standard",
      startTime: schedule.start_time.slice(0, 5),
      endTime: schedule.end_time.slice(0, 5),
      reminderMinutes: String(schedule.reminder_minutes),
    });
  }

  function closeEditor() {
    if (!saving) {
      setEditingId(null);
      setForm(EMPTY_FORM);
      setError("");
    }
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/admin/work-schedules", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Unable to save schedule.");
      setSaving(false);
      return;
    }

    closeEditor();
    await load();
    setSaving(false);
  }

  async function deleteSchedule() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setSchedules((current) => current.filter((s) => s.id !== id));

    const response = await fetch(`/api/admin/work-schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Unable to delete schedule. The list was restored.");
      await load();
    }
  }

  // Filtered schedules list
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (departmentFilter !== "all") {
        const d = (s.department || "").toLowerCase();
        const f = departmentFilter.toLowerCase();
        if (f === "hotel_restaurant") {
          if (!d.includes("hotel") && !d.includes("restaurant")) return false;
        } else if (f === "hotel_operations") {
          if (!d.includes("hotel") && !d.includes("operation")) return false;
        } else if (f === "hotel") {
          if (!d.includes("hotel")) return false;
        } else if (f === "restaurant") {
          if (!d.includes("restaurant")) return false;
        } else if (f === "operations") {
          if (!d.includes("operation")) return false;
        } else if (d !== f) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = s.name.toLowerCase().includes(q);
        const roleMatch = s.job_classification.toLowerCase().includes(q);
        const deptMatch = s.department.toLowerCase().includes(q);
        if (!nameMatch && !roleMatch && !deptMatch) return false;
      }

      return true;
    });
  }, [schedules, departmentFilter, searchQuery]);

  // Derived unique departments from current schedules
  const allDepartments = useMemo(() => {
    const set = new Set<string>(PRESET_DEPARTMENTS);
    schedules.forEach((s) => {
      if (s.department?.trim()) set.add(s.department.trim());
    });
    return Array.from(set);
  }, [schedules]);

  // Derived unique classifications from current schedules
  const allClassifications = useMemo(() => {
    const set = new Set<string>(PRESET_CLASSIFICATIONS);
    schedules.forEach((s) => {
      if (s.job_classification?.trim()) set.add(s.job_classification.trim());
    });
    return Array.from(set);
  }, [schedules]);

  return (
    <Card className="border-orange-200 bg-white/80 shadow-xl dark:border-orange-700 dark:bg-gray-800/80">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <CalendarClock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              Staff Time Schedules &amp; Register Rules
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Configure authoritative reporting (check-in) times, shift close (check-out) limits, and reminders for each department and workforce role.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded-full bg-orange-100 px-3 py-1 font-semibold text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
              {schedules.length} active schedules
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6">
        {/* Creation / Quick Add Form */}
        <form
          onSubmit={saveSchedule}
          className="grid gap-4 rounded-2xl border border-orange-200 bg-orange-50/30 p-4 dark:border-orange-800 dark:bg-orange-950/20 md:grid-cols-3"
        >
          <div className="md:col-span-3">
            <Label htmlFor="schedule-name" className="text-xs font-semibold text-muted-foreground">
              Schedule name
            </Label>
            <Input
              id="schedule-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Restaurant Waiter &amp; Front Desk Shift"
              className="mt-1"
            />
          </div>

          <SearchableScheduleCombobox
            id="schedule-department"
            label="Department"
            value={form.department}
            options={allDepartments}
            placeholder="Select or enter department"
            onChange={(department) => setForm({ ...form, department })}
          />

          <SearchableScheduleCombobox
            id="schedule-role"
            label="Role or classification"
            value={form.jobClassification}
            options={allClassifications}
            placeholder="Select or enter role"
            onChange={(jobClassification) => setForm({ ...form, jobClassification })}
          />

          <div>
            <Label htmlFor="schedule-shift-period" className="text-xs font-semibold text-muted-foreground">
              Shift period
            </Label>
            <div className="relative mt-1">
              <select
                id="schedule-shift-period"
                value={form.shiftPeriod}
                onChange={(e) => setForm({ ...form, shiftPeriod: e.target.value })}
                className="min-h-10 w-full appearance-none rounded-md border border-input bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SHIFT_PERIODS.map((sp) => (
                  <option key={sp.value} value={sp.value}>
                    {sp.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div>
            <Label htmlFor="schedule-start" className="text-xs font-semibold text-muted-foreground">
              Reporting time (Check-in start)
            </Label>
            <Input
              id="schedule-start"
              required
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="schedule-end" className="text-xs font-semibold text-muted-foreground">
              Shift close (Min. check-out time)
            </Label>
            <Input
              id="schedule-end"
              required
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="schedule-reminder" className="text-xs font-semibold text-muted-foreground">
              Shift reminder (Minutes before start)
            </Label>
            <Input
              id="schedule-reminder"
              type="number"
              min="0"
              max="180"
              value={form.reminderMinutes}
              onChange={(e) => setForm({ ...form, reminderMinutes: e.target.value })}
              className="mt-1"
            />
          </div>

          <div className="md:col-span-3 flex justify-end">
            <Button
              disabled={saving}
              type="submit"
              className="min-h-10 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 font-semibold text-white shadow-sm"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {editingId ? "Save schedule changes" : "Create new time schedule"}
            </Button>
          </div>

          {error && (
            <p role="alert" className="md:col-span-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
        </form>

        {/* Schedule List Filter & Search Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search schedules by name, department, or role…"
              className="min-h-10 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          </div>

          <div className="relative w-full sm:w-60">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="min-h-10 w-full appearance-none rounded-xl border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="all">All departments ({schedules.length})</option>
              {PRESET_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Schedules Cards Grid */}
        <div className="grid gap-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-orange-600" />
              Loading schedules…
            </div>
          ) : filteredSchedules.length ? (
            filteredSchedules.map((schedule) => {
              const dept = schedule.department || "Restaurant";
              const deptBadgeClass =
                dept.toLowerCase().includes("hotel") && dept.toLowerCase().includes("restaurant")
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                  : dept.toLowerCase().includes("hotel")
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                  : dept.toLowerCase().includes("restaurant")
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";

              return (
                <div
                  key={schedule.id}
                  className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-card p-4 shadow-xs transition hover:border-orange-300 dark:border-orange-800 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{schedule.name}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${deptBadgeClass}`}>
                        {dept}
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {schedule.job_classification}
                      </span>
                      {schedule.shift_period && schedule.shift_period !== "standard" && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                          {schedule.shift_period}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <Clock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                        Reporting: {schedule.start_time.slice(0, 5)} – Close: {schedule.end_time.slice(0, 5)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                        Reminder: {schedule.reminder_minutes} min prior
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(schedule)}
                      className="rounded-xl border-orange-200 hover:bg-orange-50 dark:border-orange-800 dark:hover:bg-orange-950/40"
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(schedule)}
                      aria-label={`Delete ${schedule.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No schedules match the selected department or search criteria.
            </p>
          )}
        </div>
      </CardContent>

      {/* Edit Schedule Dialog */}
      <Dialog open={Boolean(editingId)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit staff time schedule</DialogTitle>
            <DialogDescription>
              Changes immediately update shift reporting and check-out rules for matching staff in the Attendance Register.
            </DialogDescription>
          </DialogHeader>
          <form id="schedule-editor" onSubmit={saveSchedule} className="grid gap-4 mt-2">
            <div>
              <Label htmlFor="edit-schedule-name" className="text-xs font-semibold text-muted-foreground">
                Schedule name
              </Label>
              <Input
                id="edit-schedule-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableScheduleCombobox
                id="edit-schedule-department"
                label="Department"
                value={form.department}
                options={allDepartments}
                placeholder="Search departments"
                onChange={(department) => setForm({ ...form, department })}
              />

              <SearchableScheduleCombobox
                id="edit-schedule-role"
                label="Role or classification"
                value={form.jobClassification}
                options={allClassifications}
                placeholder="Search roles"
                onChange={(jobClassification) => setForm({ ...form, jobClassification })}
              />
            </div>

            <div>
              <Label htmlFor="edit-shift-period" className="text-xs font-semibold text-muted-foreground">
                Shift period
              </Label>
              <div className="relative mt-1">
                <select
                  id="edit-shift-period"
                  value={form.shiftPeriod}
                  onChange={(e) => setForm({ ...form, shiftPeriod: e.target.value })}
                  className="min-h-10 w-full appearance-none rounded-md border border-input bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SHIFT_PERIODS.map((sp) => (
                    <option key={sp.value} value={sp.value}>
                      {sp.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-schedule-start" className="text-xs font-semibold text-muted-foreground">
                  Reporting time (Check-in start)
                </Label>
                <Input
                  id="edit-schedule-start"
                  required
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-schedule-end" className="text-xs font-semibold text-muted-foreground">
                  Shift close (Min. check-out)
                </Label>
                <Input
                  id="edit-schedule-end"
                  required
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-schedule-reminder" className="text-xs font-semibold text-muted-foreground">
                Reminder minutes before start
              </Label>
              <Input
                id="edit-schedule-reminder"
                type="number"
                min="0"
                max="180"
                value={form.reminderMinutes}
                onChange={(e) => setForm({ ...form, reminderMinutes: e.target.value })}
                className="mt-1"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}

            <DialogFooter className="mt-3">
              <Button type="button" variant="outline" onClick={closeEditor}>
                Cancel
              </Button>
              <Button
                disabled={saving}
                type="submit"
                className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this time schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be removed from future shift matching. Existing attendance records will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteSchedule()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
