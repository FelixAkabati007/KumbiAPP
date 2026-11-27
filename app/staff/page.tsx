"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Award, CalendarDays, Clock3, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { LogoDisplay } from "@/components/logo-display";
import { PropertyClock } from "@/components/property-clock";
import { NotificationBell } from "@/components/notification-bell";
import { useRealtime } from "@/components/realtime-provider";
import { enqueueOfflineAttendance } from "@/lib/offline-storage";
import { getRoleDisplayName, managementRoles, type UserRole } from "@/lib/roles";

interface PersonalPointsData {
  totalPoints: number;
  eventCount: number;
  events: Array<{
    id: string;
    points: string | number;
    source_type: string;
    completed_at: string;
    metadata?: { reason?: string; category?: string } | null;
  }>;
}

interface AttendanceRecord {
  check_in_at?: string;
  check_out_at?: string;
  verification_status?: string;
  status?: string;
  late_minutes?: number | null;
  early_checkout_minutes?: number | null;
}
interface AttendanceException { id: string; attendance_date: string; status: string; manager_message?: string; staff_reply?: string }
interface PermissionRequest { id: string; start_date: string; end_date: string; reason: string; handover_notes?: string; status: string; reviewer_message?: string }
interface LeaveRequest { id: string; leave_type: string; start_date: string; end_date: string; reason: string; status: string; reviewer_message?: string }
interface FeaturePermissions { leave_requests_enabled: boolean; planned_absence_enabled: boolean; attendance_exceptions_enabled: boolean }

interface WorkSchedule {
  schedule_name: string;
  job_classification: string;
  department: string;
  shift_period: string;
  start_time: string;
  end_time: string;
  reminder_minutes: number;
  assignment_status: string;
  source?: "schedule" | "assignment" | "fallback";
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function attendanceStatus(record: AttendanceRecord | null, nextAction: "check_in" | "check_out" | "complete") {
  if (nextAction === "complete") return "Completed for today";
  if (nextAction === "check_out") return "Checked in — awaiting check-out";
  if (record?.verification_status === "pending") return "Checked in — awaiting manager confirmation";
  return "Not checked in";
}

export default function StaffPage() {
  const { user, isLoading } = useAuth();
  const { lastEvent } = useRealtime();
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [personalPoints, setPersonalPoints] = useState<PersonalPointsData>({ totalPoints: 0, eventCount: 0, events: [] });
  const [exceptions, setExceptions] = useState<AttendanceException[]>([]);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [permissionForm, setPermissionForm] = useState({ startDate: "", endDate: "", reason: "", handoverNotes: "" });
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "annual", startDate: "", endDate: "", reason: "", medicalReportPath: "" });
  const [reportName, setReportName] = useState("");
  const [reply, setReply] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error" | "neutral">("neutral");
  const [nextAction, setNextAction] = useState<"check_in" | "check_out" | "complete">("check_in");
  const [featurePermissions, setFeaturePermissions] = useState<FeaturePermissions>({ leave_requests_enabled: true, planned_absence_enabled: true, attendance_exceptions_enabled: true });

  const load = useCallback(async () => {
    const [attendanceResponse, scheduleResponse, featureResponse, pointsResponse] = await Promise.all([
      fetch("/api/v2/attendance", { cache: "no-store" }),
      fetch("/api/workforce/schedule", { cache: "no-store" }),
      fetch("/api/attendance/feature-permissions", { cache: "no-store" }),
      fetch("/api/performance?scope=me", { cache: "no-store" }),
    ]);
    if (attendanceResponse.ok) {
      const attendance = await attendanceResponse.json();
      setRecord(attendance.record ?? null);
      setNextAction(attendance.nextAction ?? "check_in");
    }
    if (scheduleResponse.ok) setSchedule((await scheduleResponse.json()).schedule ?? null);
    if (featureResponse.ok) setFeaturePermissions((await featureResponse.json()).permissions ?? { leave_requests_enabled: true, planned_absence_enabled: true, attendance_exceptions_enabled: true });
    if (pointsResponse.ok) {
      const pts = await pointsResponse.json();
      setPersonalPoints({
        totalPoints: Number(pts.summary?.total_points ?? 0),
        eventCount: Number(pts.summary?.event_count ?? 0),
        events: Array.isArray(pts.events) ? pts.events.slice(0, 5) : [],
      });
    }
    const exceptionResponse = await fetch("/api/attendance/exceptions", { cache: "no-store" });
    if (exceptionResponse.ok) setExceptions((await exceptionResponse.json()).exceptions ?? []);
    const permissionResponse = await fetch("/api/attendance/permissions", { cache: "no-store" });
    if (permissionResponse.ok) setPermissionRequests((await permissionResponse.json()).requests ?? []);
    const leaveResponse = await fetch("/api/attendance/leave", { cache: "no-store" });
    if (leaveResponse.ok) setLeaveRequests((await leaveResponse.json()).requests ?? []);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) window.location.assign("/login");
    if (!isLoading && user && managementRoles.includes(user.role as UserRole)) window.location.assign("/attendance");
    if (!isLoading && user && !managementRoles.includes(user.role as UserRole)) void load();
  }, [isLoading, user, load]);

  useEffect(() => {
    if (!lastEvent || !user || managementRoles.includes(user.role as UserRole)) return;
    if (
      lastEvent.topic === "attendance.updated" ||
      lastEvent.topic === "staff.updated" ||
      lastEvent.topic === "performance.updated"
    ) {
      void load();
    }
  }, [lastEvent, user, load]);

  useEffect(() => {
    if (typeof window === "undefined" || !user || managementRoles.includes(user.role as UserRole)) return;
    const refresh = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("kumbi:offline-synced", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("kumbi:offline-synced", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user, load]);

  async function submitPermission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/attendance/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(permissionForm) });
    const data = await response.json();
    setMessage(response.ok ? "Permission request sent for manager approval." : data.error ?? "Unable to submit permission request.");
    if (response.ok) setPermissionForm({ startDate: "", endDate: "", reason: "", handoverNotes: "" });
    await load();
    setBusy(false);
  }

  async function submitLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/attendance/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(leaveForm) });
    const data = await response.json();
    setMessage(response.ok ? "Leave request sent for approval." : data.error ?? "Unable to submit leave request.");
    if (response.ok) setLeaveForm({ leaveType: "annual", startDate: "", endDate: "", reason: "", medicalReportPath: "" });
    await load();
    setBusy(false);
  }

  async function uploadMedicalReport(file: File) {
    const body = new FormData(); body.append("file", file);
    const response = await fetch("/api/attendance/leave/upload", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "Unable to upload medical report."); return; }
    setLeaveForm((current) => ({ ...current, medicalReportPath: data.pathname }));
    setReportName(file.name);
    setMessage("Medical report uploaded securely.");
  }

  async function register(action: "check_in" | "check_out") {
    setBusy(true);
    setMessage("");
    setMessageTone("neutral");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueOfflineAttendance({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload: { action },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });
      setMessage(action === "check_in" ? "Check-in recorded locally (offline mode). Will sync automatically." : "Check-out recorded locally (offline mode). Will sync automatically.");
      setMessageTone("success");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/v2/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      const earlyMins = Number(data?.record?.early_checkout_minutes ?? 0);
      const successMessage =
        action === "check_in"
          ? "Check-in successful"
          : earlyMins > 0
          ? `Check-out successful (recorded ${earlyMins}m before scheduled close)`
          : "Check-out successful";
      setMessage(response.ok ? successMessage : data.error ?? `Check-${action === "check_in" ? "in" : "out"} failed`);
      setMessageTone(response.ok ? "success" : "error");
      if (response.ok) {
        if (data.record) {
          setRecord(data.record);
        }
        setNextAction(data.nextAction ?? (action === "check_in" ? "check_out" : "complete"));
        await load();
      } else if (data.code === "ALREADY_CHECKED_IN" || data.code === "ALREADY_CHECKED_OUT") {
        await load();
      }
      setBusy(false);
    } catch {
      enqueueOfflineAttendance({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload: { action },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });
      setMessage("Recorded locally (offline mode). Will sync automatically when connection is restored.");
      setMessageTone("success");
      setBusy(false);
    }
  }

  const isWorkforce = Boolean(user && !managementRoles.includes(user.role as UserRole));
  if (isLoading || !user || !isWorkforce) return null;

  const roleName = getRoleDisplayName(user.role);
  const open = nextAction === "check_out";
  const canCheckIn = nextAction === "check_in";
  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/80 px-3 py-3 backdrop-blur-md dark:border-orange-700 dark:bg-gray-900/80 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-orange-200 bg-white/80 px-3 py-2 text-sm font-semibold transition hover:bg-orange-50 dark:border-orange-700 dark:bg-gray-800/80">
            <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" /> Back to dashboard
          </Link>
          <LogoDisplay size="sm" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            <span className="text-base font-semibold text-gray-800 dark:text-gray-200 sm:text-lg">{roleName} Attendance &amp; Schedule</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PropertyClock compact />
          <NotificationBell />
        </div>
      </header>
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
        <div>
          <p className="text-sm font-medium text-primary">{roleName} workspace</p>
          <h1 className="text-3xl font-bold tracking-tight">{roleName} Attendance</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Use this page to review your schedule rules and record your shift start and finish.</p>
        </div>
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-background p-3 text-primary"><CalendarDays className="h-6 w-6" aria-hidden="true" /></div>
            <div>
              <h2 className="text-xl font-semibold">Today&apos;s schedule</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your reminder is sent {schedule?.reminder_minutes ?? 20} minutes before reporting time.
              </p>
            </div>
          </div>
          {schedule ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
                <p className="mt-1 font-semibold">{schedule.job_classification}</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Report</p>
                <p className="mt-1 font-semibold">{schedule.start_time}</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Close</p>
                <p className="mt-1 font-semibold">{schedule.end_time}</p>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">No schedule assigned for today.</p>
          )}
          {schedule?.source === "fallback" && (
            <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              These are default times, not your manager&apos;s configured schedule. Please tell your manager to check Settings → Staff management → Staff time schedules.
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div>
            <div><h2 className="text-xl font-semibold">Today&apos;s attendance</h2><p className="mt-1 text-sm text-muted-foreground">Your manager will review the recorded attendance.</p></div>
          </div>
          <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm"><span className="text-muted-foreground">Today&apos;s status</span><span className="mx-2 text-muted-foreground">·</span><span className="font-semibold">{attendanceStatus(record, nextAction)}</span><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground"><span>Checked in: {formatTime(record?.check_in_at)}</span><span>Checked out: {formatTime(record?.check_out_at)}</span></div></div>
          <div className="mt-5">
            {canCheckIn && (
              <button
                disabled={busy}
                onClick={() => void register("check_in")}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 px-5 py-3 font-semibold text-white shadow-md transition disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" /> Check in
              </button>
            )}
            {open && (
              <button
                disabled={busy}
                onClick={() => void register("check_out")}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 px-5 py-3 font-semibold text-white shadow-md transition disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" /> Check out
              </button>
            )}
            {nextAction === "complete" && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-800">Attendance completed for today</div>}
          </div>
          {message && <p role="status" aria-live="polite" className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${messageTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : messageTone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-border bg-muted"}`}>{message}</p>}
        </section>

        {/* Workforce Performance Points Summary */}
        <section className="rounded-2xl border border-amber-200 bg-background p-5 shadow-sm sm:p-6 dark:border-amber-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/15 p-3 text-amber-600 dark:text-amber-400">
                <Award className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">My Performance Points</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Earned automatically from verified attendance, completed shifts, guest orders, and operational tasks.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-2 text-right dark:border-amber-800 dark:bg-amber-950/40">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Points</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{personalPoints.totalPoints.toLocaleString()}</p>
            </div>
          </div>
          {personalPoints.events.length > 0 ? (
            <div className="mt-4 space-y-2">
              {personalPoints.events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{ev.metadata?.category || ev.source_type}</p>
                    <p className="truncate text-xs text-muted-foreground">{ev.metadata?.reason || "Verified operational activity"}</p>
                  </div>
                  <span className={`shrink-0 font-semibold ${Number(ev.points) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {Number(ev.points) > 0 ? "+" : ""}{Number(ev.points)} pts
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              Points appear here automatically as your attendance shifts and completed tasks are recorded.
            </p>
          )}
        </section>
        {featurePermissions.planned_absence_enabled && <section className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6"><h2 className="text-xl font-semibold">Request planned absence</h2><p className="mt-1 text-sm text-muted-foreground">Submit permission before your absence so it is recorded as excused instead of missing attendance.</p><form onSubmit={submitPermission} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Start date<input required type="date" value={permissionForm.startDate} onChange={(event) => setPermissionForm((current) => ({ ...current, startDate: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-background px-3" /></label><label className="grid gap-1 text-sm font-medium">End date<input required type="date" value={permissionForm.endDate} onChange={(event) => setPermissionForm((current) => ({ ...current, endDate: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-background px-3" /></label><label className="grid gap-1 text-sm font-medium sm:col-span-2">Reason<textarea required value={permissionForm.reason} onChange={(event) => setPermissionForm((current) => ({ ...current, reason: event.target.value }))} className="min-h-20 rounded-xl border border-border bg-background p-3" placeholder="Why do you need permission?" /></label><label className="grid gap-1 text-sm font-medium sm:col-span-2">Handover notes<textarea value={permissionForm.handoverNotes} onChange={(event) => setPermissionForm((current) => ({ ...current, handoverNotes: event.target.value }))} className="min-h-20 rounded-xl border border-border bg-background p-3" placeholder="Optional arrangements with your replacement" /></label><button disabled={busy} type="submit" className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50 sm:w-fit">Send permission request</button></form>{permissionRequests.length > 0 && <div className="mt-5 space-y-2">{permissionRequests.map((item) => <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-3 text-sm"><span className="font-semibold">{item.start_date} to {item.end_date}</span><span className="mx-2 text-muted-foreground">·</span>{item.status}{item.reviewer_message && <p className="mt-1 text-muted-foreground">{item.reviewer_message}</p>}</div>)}</div>}</section>
        }
        {featurePermissions.leave_requests_enabled && <section className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6"><h2 className="text-xl font-semibold">Request leave</h2><p className="mt-1 text-sm text-muted-foreground">Sick and maternity leave require a medical hospital report.</p><form onSubmit={submitLeave} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Leave type<select value={leaveForm.leaveType} onChange={(event) => setLeaveForm((current) => ({ ...current, leaveType: event.target.value, medicalReportPath: "" }))} className="min-h-11 rounded-xl border border-border bg-background px-3"><option value="annual">Annual leave</option><option value="sick">Sick leave</option><option value="maternity">Maternity leave</option><option value="emergency">Emergency leave</option><option value="unpaid">Unpaid leave</option><option value="other">Other leave</option></select></label><div /><label className="grid gap-1 text-sm font-medium">Start date<input required type="date" value={leaveForm.startDate} onChange={(event) => setLeaveForm((current) => ({ ...current, startDate: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-background px-3" /></label><label className="grid gap-1 text-sm font-medium">End date<input required type="date" value={leaveForm.endDate} onChange={(event) => setLeaveForm((current) => ({ ...current, endDate: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-background px-3" /></label><label className="grid gap-1 text-sm font-medium sm:col-span-2">Reason<textarea required value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} className="min-h-20 rounded-xl border border-border bg-background p-3" /></label>{["sick", "maternity"].includes(leaveForm.leaveType) && <label className="grid gap-1 text-sm font-medium sm:col-span-2">Medical hospital report<input required type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedicalReport(file); }} className="min-h-11 rounded-xl border border-border bg-background p-2 text-sm" /><span className="text-xs font-normal text-muted-foreground">PDF, JPG, or PNG up to 10 MB. {reportName && `Uploaded: ${reportName}`}</span></label>}<button disabled={busy || (["sick", "maternity"].includes(leaveForm.leaveType) && !leaveForm.medicalReportPath)} type="submit" className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50 sm:w-fit">Send leave request</button></form>{leaveRequests.length > 0 && <div className="mt-5 space-y-2">{leaveRequests.map((item) => <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-3 text-sm"><span className="font-semibold">{item.leave_type} · {item.start_date} to {item.end_date}</span><span className="mx-2 text-muted-foreground">·</span>{item.status}{item.reviewer_message && <p className="mt-1 text-muted-foreground">{item.reviewer_message}</p>}</div>)}</div>}</section>
        }
        {featurePermissions.attendance_exceptions_enabled && exceptions.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><h2 className="text-xl font-semibold text-amber-950">Attendance messages</h2><div className="mt-3 space-y-3">{exceptions.map((item) => <div key={item.id} className="rounded-xl border border-amber-200 bg-background p-4"><p className="text-sm font-semibold">{item.attendance_date} · {item.status}</p>{item.manager_message && <p className="mt-2 text-sm">{item.manager_message}</p>}{(item.status === "approved" || item.status === "denied") && <button type="button" onClick={async () => { await fetch("/api/attendance/exceptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: "resumed" }) }); await load(); }} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Resume work</button>}{item.status === "awaiting_reason" && <>{replyingTo === item.id ? <div className="mt-3 space-y-2"><textarea value={reply} onChange={(event) => setReply(event.target.value)} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="Explain your absence..." /><button type="button" onClick={async () => { await fetch("/api/attendance/exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, message: reply }) }); setReply(""); setReplyingTo(null); await load(); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Send</button></div> : <button type="button" onClick={() => setReplyingTo(item.id)} className="mt-3 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold">Reply</button>}</>}</div>)}</div></section>}
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" aria-hidden="true" /> Attendance times are recorded automatically.</div>
      </div>
    </main>
  );
}
