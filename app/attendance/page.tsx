"use client";

import Link from "next/link";
import { enqueueOfflineAttendance } from "@/lib/offline-storage";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LogoDisplay } from "@/components/logo-display";
import { useRealtime } from "@/components/realtime-provider";
import { FeaturePermissionsModal } from "@/components/attendance/feature-permissions-modal";
import {
  BulkFeaturePermissions,
  PRESET_DEPARTMENTS,
  type StaffPermissionRow,
} from "@/components/attendance/bulk-feature-permissions";

interface RecordRow {
  id: string;
  staff_id?: string;
  staff_name?: string;
  position?: string;
  job_classification?: string;
  department?: string;
  staff_email?: string;
  staff_role?: string;
  check_in_at?: string;
  check_out_at?: string;
  late_minutes?: number | null;
  early_checkout_minutes?: number | null;
  schedule_name?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status: string;
  verification_status: string;
  lifecycleStatus?: string;
  verified_at?: string;
  shift_period?: string;
}

interface ManagerData {
  pending: RecordRow[];
  todayRecords?: RecordRow[];
  summary?: { present: string; pending: string; absent: string; checkedOut?: string };
  frequency: { staff_id: string; verified_days: string; recorded_days: string }[];
}

interface AttendanceException {
  id: string;
  staff_name?: string;
  department?: string;
  attendance_date: string;
  status: string;
  manager_message?: string;
  staff_reply?: string;
}

interface PermissionRequest {
  id: string;
  staff_name?: string;
  department?: string;
  start_date: string;
  end_date: string;
  reason: string;
  handover_notes?: string;
  status: string;
  reviewer_message?: string;
}

interface LeaveRequest {
  id: string;
  staff_name?: string;
  department?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  medical_report_path?: string;
  reviewer_message?: string;
}

export interface EnrichedStaffAccount {
  id: string;
  name: string;
  department: string;
  job_classification: string;
  position?: string;
  role?: string;
  leave: boolean;
  planned: boolean;
  exceptions: boolean;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function formatLifecycleStatus(value?: string) {
  return (
    ({
      waiting_for_approval: "Waiting for approval",
      approved: "Approved",
      approved_late: "Approved (late)",
      verified: "Verified",
      late: "Late",
      rejected: "Rejected",
      completed: "Completed",
      checked_out: "Checked out",
      checked_out_early: "Checked out (early)",
      auto_checked_out: "Auto checked out",
      manager_corrected: "Checked out (manager)",
      not_checked_in: "Not checked in",
    } as Record<string, string>)[value ?? ""] ??
    value ??
    "Not checked in"
  );
}

export default function AttendancePage() {
  const { lastEvent } = useRealtime();
  const [record, setRecord] = useState<RecordRow | null>(null);
  const [canCheckIn, setCanCheckIn] = useState(true);
  const [manager, setManager] = useState<ManagerData | null>(null);
  const [exceptions, setExceptions] = useState<AttendanceException[]>([]);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Synced permissions state
  const [staffAccounts, setStaffAccounts] = useState<EnrichedStaffAccount[]>([]);
  const [permissionRows, setPermissionRows] = useState<StaffPermissionRow[]>([]);
  const [permissionTarget, setPermissionTarget] = useState<{ id: string; name: string } | null>(null);
  const [managerTab, setManagerTab] = useState<"all" | "confirmations" | "requests" | "permissions">("all");

  // Individual account override filters
  const [individualDeptFilter, setIndividualDeptFilter] = useState("all");
  const [individualSearch, setIndividualSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const statusResponse = await fetch("/api/v2/attendance", { cache: "no-store" });
      if (statusResponse.status === 401 || statusResponse.status === 403) {
        setAccessDenied(true);
        setMessage("Sign in to record your attendance for today.");
        setLoading(false);
        return;
      }
      const status = statusResponse.ok ? await statusResponse.json() : null;
      setAccessDenied(false);
      setRecord(status?.record ?? null);
      setCanCheckIn(status?.canCheckIn !== false);

      const review = await fetch("/api/v2/attendance/manager", { cache: "no-store" });
      if (review.ok) {
        const managerJson = await review.json();
        setManager(managerJson);

        const staffResponse = await fetch("/api/attendance/feature-permissions", { cache: "no-store" });
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          const rows = (staffData.permissions ?? []).filter(
            (item: { staff_id?: string }) => item.staff_id,
          ) as StaffPermissionRow[];
          setPermissionRows(rows);
          setStaffAccounts(
            rows.map((item) => ({
              id: item.staff_id,
              name: item.staff_name || "Staff member",
              department: item.department || "Restaurant",
              job_classification: item.job_classification || item.position || item.role || "Staff",
              position: item.position || "",
              role: item.role || "",
              leave: item.leave_requests_enabled !== false,
              planned: item.planned_absence_enabled !== false,
              exceptions: item.attendance_exceptions_enabled !== false,
            })),
          );
        }
      }

      const exceptionResponse = await fetch("/api/attendance/exceptions", { cache: "no-store" });
      if (exceptionResponse.ok) setExceptions((await exceptionResponse.json()).exceptions ?? []);

      const permissionResponse = await fetch("/api/attendance/permissions", { cache: "no-store" });
      if (permissionResponse.ok) setPermissionRequests((await permissionResponse.json()).requests ?? []);

      const leaveResponse = await fetch("/api/attendance/leave", { cache: "no-store" });
      if (leaveResponse.ok) setLeaveRequests((await leaveResponse.json()).requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.topic === "attendance.updated" || lastEvent.topic === "staff.updated") {
      void load(true);
    }
  }, [lastEvent, load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      if (!document.hidden) void load(true);
    };
    window.addEventListener("kumbi:offline-synced", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener("kumbi:offline-synced", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(interval);
    };
  }, [load]);

  async function register(action: "check_in" | "check_out") {
    setBusy(true);
    setMessage("");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueOfflineAttendance({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload: { action },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });
      setMessage(
        action === "check_in"
          ? "Check-In recorded locally (offline mode). Will sync automatically."
          : "Check-Out recorded locally (offline mode). Will sync automatically.",
      );
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
      const data = await response.json();
      setMessage(
        response.ok
          ? action === "check_in"
            ? "Check-In recorded. Waiting for approval."
            : "Check-Out recorded for today."
          : response.status === 401 || response.status === 403
          ? "Sign in to use the attendance register."
          : data.error ?? "Unable to update register",
      );
      setAccessDenied(response.status === 401 || response.status === 403);
      setBusy(false);
      if (response.ok) void load(true);
    } catch {
      enqueueOfflineAttendance({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payload: { action },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });
      setMessage("Recorded locally (offline mode). Will sync automatically when connection is restored.");
      setBusy(false);
    }
  }

  async function decide(id: string, status: "verified" | "late" | "rejected") {
    await fetch("/api/v2/attendance/manager", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    void load(true);
  }

  async function markCheckedOut(attendanceId: string) {
    await fetch("/api/v2/attendance/manager/override", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendanceId, action: "correct_checkout" }),
    });
    void load(true);
  }

  async function decideLeave(id: string, status: "approved" | "denied") {
    await fetch("/api/attendance/leave", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    void load(true);
  }

  async function decidePermission(id: string, status: "approved" | "denied") {
    await fetch("/api/attendance/permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    void load(true);
  }

  async function decideException(id: string, status: "approved" | "denied" | "resumed") {
    await fetch("/api/attendance/exceptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    void load(true);
  }

  async function toggleSingleFeature(
    staffId: string,
    feature: "leaveRequestsEnabled" | "plannedAbsenceEnabled" | "attendanceExceptionsEnabled",
    currentVal: boolean,
  ) {
    const nextVal = !currentVal;
    // Optimistic update of both states
    setStaffAccounts((current) =>
      current.map((acc) => {
        if (acc.id !== staffId) return acc;
        return {
          ...acc,
          leave: feature === "leaveRequestsEnabled" ? nextVal : acc.leave,
          planned: feature === "plannedAbsenceEnabled" ? nextVal : acc.planned,
          exceptions: feature === "attendanceExceptionsEnabled" ? nextVal : acc.exceptions,
        };
      }),
    );
    setPermissionRows((current) =>
      current.map((row) => {
        if (row.staff_id !== staffId) return row;
        return {
          ...row,
          leave_requests_enabled: feature === "leaveRequestsEnabled" ? nextVal : row.leave_requests_enabled,
          planned_absence_enabled: feature === "plannedAbsenceEnabled" ? nextVal : row.planned_absence_enabled,
          attendance_exceptions_enabled: feature === "attendanceExceptionsEnabled" ? nextVal : row.attendance_exceptions_enabled,
        };
      }),
    );
    try {
      await fetch("/api/attendance/feature-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, [feature]: nextVal }),
      });
    } catch (err) {
      console.error("[attendance] individual feature toggle failed:", err);
    }
  }

  const nextAction = record?.check_in_at && !record.check_out_at ? "check_out" : record?.check_out_at ? "complete" : "check_in";

  // Filter individual staff accounts
  const filteredIndividualAccounts = staffAccounts.filter((account) => {
    if (individualDeptFilter !== "all") {
      const d = account.department.toLowerCase();
      if (individualDeptFilter === "hotel_restaurant") {
        if (!d.includes("hotel") && !d.includes("restaurant")) return false;
      } else if (individualDeptFilter === "hotel_operations") {
        if (!d.includes("hotel") && !d.includes("operation")) return false;
      } else if (individualDeptFilter === "hotel") {
        if (!d.includes("hotel")) return false;
      } else if (individualDeptFilter === "restaurant") {
        if (!d.includes("restaurant")) return false;
      } else if (individualDeptFilter === "operations") {
        if (!d.includes("operation")) return false;
      } else if (d !== individualDeptFilter.toLowerCase()) {
        return false;
      }
    }
    if (individualSearch.trim()) {
      const q = individualSearch.trim().toLowerCase();
      const nameMatch = account.name.toLowerCase().includes(q);
      const roleMatch = (account.job_classification || "").toLowerCase().includes(q);
      const deptMatch = account.department.toLowerCase().includes(q);
      if (!nameMatch && !roleMatch && !deptMatch) return false;
    }
    return true;
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/80 px-3 py-3 backdrop-blur-md dark:border-orange-700 dark:bg-gray-900/80 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-orange-200 bg-white/80 px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:border-orange-700 dark:bg-gray-800/80"
          >
            <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            Back to dashboard
          </Link>
          <LogoDisplay size="sm" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            <span className="text-base font-semibold text-gray-800 dark:text-gray-200 sm:text-lg">Workforce Register</span>
          </div>
        </div>
        {manager && (
          <Link
            href="/attendance/reports"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white/80 px-3 py-2 text-sm font-semibold transition hover:bg-orange-50 dark:border-orange-700 dark:bg-gray-800/80"
          >
            <CheckCircle2 className="h-4 w-4 text-primary" /> Open approved report
          </Link>
        )}
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-3 sm:p-4 md:p-8">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Workforce operations &amp; attendance register</p>
          <h1 className="responsive-heading font-bold tracking-tight">Staff Attendance &amp; Feature Control</h1>
          <p className="important-description mt-2 text-sm">
            Record shift attendance, review pending staff confirmations, and sync feature permissions across departments and individual staff accounts.
          </p>
        </div>

        {/* Manager personal check-in / status card */}
        <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Today&apos;s register status</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Check-ins are timestamped immediately and confirmed by a manager before attendance points are awarded.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Status:{" "}
                  <span className="font-semibold text-foreground">
                    {loading ? "Loading…" : formatLifecycleStatus(record?.lifecycleStatus ?? record?.verification_status)}
                  </span>{" "}
                  · In {formatTime(record?.check_in_at)} · Out {formatTime(record?.check_out_at)}
                </p>
              </div>
            </div>
            {!accessDenied && (
              <div className="w-full lg:w-auto">
                {nextAction === "check_in" && canCheckIn && (
                  <button
                    disabled={busy}
                    onClick={() => void register("check_in")}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 px-5 py-3 font-semibold text-white shadow-sm disabled:opacity-50 lg:w-auto"
                  >
                    <LogIn className="h-4 w-4" /> Check In
                  </button>
                )}
                {nextAction === "check_in" && !canCheckIn && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    Managerial roles do not check in as staff.
                  </div>
                )}
                {nextAction === "check_out" && (
                  <button
                    disabled={busy}
                    onClick={() => void register("check_out")}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 px-5 py-3 font-semibold text-white shadow-sm disabled:opacity-50 lg:w-auto"
                  >
                    <LogOut className="h-4 w-4" /> Check Out
                  </button>
                )}
                {nextAction === "complete" && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    Completed for today
                  </div>
                )}
              </div>
            )}
          </div>
          {message && (
            <div
              role="status"
              className={`mt-4 rounded-xl border p-3 text-sm ${
                accessDenied
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-border bg-muted text-foreground"
              }`}
            >
              {message}
            </div>
          )}
        </section>

        {/* Manager Navigation Tabs */}
        {manager && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-orange-200 bg-white/80 p-2 shadow-sm dark:border-orange-700 dark:bg-gray-900/60"
            role="tablist"
            aria-label="Manager attendance sections"
          >
            {(
              [
                ["all", "All Sections", null],
                ["confirmations", "Today's Confirmations", manager.pending.length],
                [
                  "requests",
                  "Leave & Absence Requests",
                  leaveRequests.filter((i) => i.status === "pending").length +
                    permissionRequests.filter((i) => i.status === "pending").length +
                    exceptions.length,
                ],
                ["permissions", "Staff Permissions & Sync", staffAccounts.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={managerTab === key}
                onClick={() => setManagerTab(key)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  managerTab === key
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-orange-50 hover:text-foreground dark:hover:bg-orange-950/40"
                }`}
              >
                <span>{label}</span>
                {count !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      managerTab === key
                        ? "bg-white/20 text-white"
                        : "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Section: Today's Confirmations */}
        {manager && (managerTab === "all" || managerTab === "confirmations") && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Attendance control center</h2>
              </div>
              <Link
                href="/attendance/reports"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold transition hover:bg-muted"
              >
                <CheckCircle2 className="h-4 w-4 text-primary" /> Open approved report
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Present today" value={manager.summary?.present ?? "0"} icon={<CheckCircle2 />} />
              <Metric label="Checked out" value={manager.summary?.checkedOut ?? "0"} icon={<LogOut />} />
              <Metric label="Pending review" value={manager.summary?.pending ?? "0"} icon={<Clock3 />} />
              <Metric label="Absent / unrecorded" value={manager.summary?.absent ?? "0"} icon={<Users />} />
            </div>
            <div className="rounded-2xl border bg-background p-5 shadow-sm">
              <h3 className="font-semibold text-foreground">Pending confirmations ({manager.pending.length})</h3>
              <div className="mt-3 divide-y divide-border">
                {manager.pending.length ? (
                  manager.pending.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-foreground">
                          {item.staff_name || item.staff_email || item.staff_id || "Unknown staff account"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Position: {item.position || item.job_classification || "Staff"} · Role:{" "}
                          {item.staff_role || "Staff"}
                          {item.department ? ` · Department: ${item.department}` : ""} · Checked in at{" "}
                          {formatTime(item.check_in_at)}
                          {item.check_out_at ? ` · Checked out at ${formatTime(item.check_out_at)}` : ""}
                        </p>
                        {item.staff_email && <p className="mt-1 text-xs text-muted-foreground">{item.staff_email}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            {item.shift_period || "Unscheduled"} shift
                            {item.scheduled_start && item.scheduled_end
                              ? ` (${item.scheduled_start}–${item.scheduled_end})`
                              : ""}
                          </span>
                          {Number(item.late_minutes ?? 0) > 0 && (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                              +{item.late_minutes}m late
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void decide(item.id, "verified")}
                          className="min-h-10 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                          Confirm present
                        </button>
                        <button
                          onClick={() => void decide(item.id, "late")}
                          className="min-h-10 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                        >
                          Mark late
                        </button>
                        <button
                          onClick={() => void decide(item.id, "rejected")}
                          className="min-h-10 rounded-xl border border-destructive/40 bg-background px-3.5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">No pending confirmations.</p>
                )}
              </div>
            </div>

            {/* Today's Live Staff Register (all captured check-ins & check-outs) */}
            <div className="rounded-2xl border bg-background p-5 shadow-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    Today&apos;s live staff register ({(manager.todayRecords ?? []).length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Tracks every staff check-in, scheduled shift window, verification status, and check-out time in real time.
                  </p>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                {(manager.todayRecords ?? []).length ? (
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5">Staff</th>
                        <th className="px-3 py-2.5">Schedule</th>
                        <th className="px-3 py-2.5">Check-In</th>
                        <th className="px-3 py-2.5">Check-Out</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(manager.todayRecords ?? []).map((item) => {
                        const isOpenShift = Boolean(item.check_in_at && !item.check_out_at);
                        return (
                          <tr key={item.id} className="hover:bg-muted/30">
                            <td className="px-3 py-3">
                              <p className="font-semibold text-foreground">
                                {item.staff_name || item.staff_email || item.staff_id || "Staff member"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.position || item.job_classification || item.staff_role || "Staff"}
                                {item.department ? ` · ${item.department}` : ""}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                                {item.scheduled_start && item.scheduled_end
                                  ? `${item.scheduled_start}–${item.scheduled_end}`
                                  : item.shift_period || "Unscheduled"}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span>{formatTime(item.check_in_at)}</span>
                              {Number(item.late_minutes ?? 0) > 0 && (
                                <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                                  +{item.late_minutes}m
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {item.check_out_at ? (
                                <>
                                  <span className="font-medium text-foreground">{formatTime(item.check_out_at)}</span>
                                  {Number(item.early_checkout_minutes ?? 0) > 0 && (
                                    <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-300">
                                      (-{item.early_checkout_minutes}m early)
                                    </span>
                                  )}
                                </>
                              ) : item.check_in_at ? (
                                <span className="text-xs font-medium text-primary">On shift</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  item.check_out_at
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                    : item.verification_status === "pending"
                                    ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                                    : item.verification_status === "rejected" || item.verification_status === "absent"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                }`}
                              >
                                {formatLifecycleStatus(item.lifecycleStatus ?? item.verification_status)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              {isOpenShift ? (
                                <button
                                  type="button"
                                  onClick={() => void markCheckedOut(item.id)}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900 transition hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
                                >
                                  <LogOut className="h-3.5 w-3.5" /> Mark Checked Out
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">No attendance records captured yet today.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Section: Bulk Departmental Feature Permissions */}
        {manager && (managerTab === "all" || managerTab === "permissions") && (
          <BulkFeaturePermissions
            accounts={permissionRows}
            onChange={(rows) => {
              setPermissionRows((current) =>
                current.map((account) => rows.find((updated) => updated.staff_id === account.staff_id) ?? account),
              );
              setStaffAccounts((current) =>
                current.map((acc) => {
                  const matching = rows.find((r) => r.staff_id === acc.id);
                  if (!matching) return acc;
                  return {
                    ...acc,
                    department: matching.department || acc.department,
                    job_classification: matching.job_classification || acc.job_classification,
                    leave: matching.leave_requests_enabled,
                    planned: matching.planned_absence_enabled,
                    exceptions: matching.attendance_exceptions_enabled,
                  };
                }),
              );
            }}
          />
        )}

        {/* Section: Individual Account Overrides with search and department filtering */}
        {manager && (managerTab === "all" || managerTab === "permissions") && (
          <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Individual account overrides</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fine-tune leave, absence, and exception access for specific staff members across all departments.
                </p>
              </div>
            </div>

            {/* Sub-toolbar: Search & Department filter for Individual Cards */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={individualSearch}
                  onChange={(e) => setIndividualSearch(e.target.value)}
                  placeholder="Filter by name, department, or role…"
                  className="min-h-10 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>

              <div className="relative w-full sm:w-64">
                <select
                  value={individualDeptFilter}
                  onChange={(e) => setIndividualDeptFilter(e.target.value)}
                  className="min-h-10 w-full appearance-none rounded-xl border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  {PRESET_DEPARTMENTS.map((dept) => (
                    <option key={dept.value} value={dept.value}>
                      {dept.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Individual Accounts Grid */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredIndividualAccounts.length ? (
                filteredIndividualAccounts.map((staffMember) => {
                  const dept = staffMember.department || "Restaurant";
                  const deptBadgeClass =
                    dept.toLowerCase().includes("hotel")
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      : dept.toLowerCase().includes("restaurant")
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";

                  return (
                    <div
                      key={staffMember.id}
                      className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{staffMember.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className={`rounded-full px-2 py-0.5 font-medium ${deptBadgeClass}`}>{dept}</span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                {staffMember.job_classification || staffMember.role || "Staff"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPermissionTarget({ id: staffMember.id, name: staffMember.name })}
                            className="shrink-0 rounded-xl border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 transition hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                          >
                            Manage
                          </button>
                        </div>

                        {/* Interactive Quick Toggle Pills */}
                        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              void toggleSingleFeature(staffMember.id, "leaveRequestsEnabled", staffMember.leave)
                            }
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                              staffMember.leave
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            Leave {staffMember.leave ? "ON" : "OFF"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void toggleSingleFeature(staffMember.id, "plannedAbsenceEnabled", staffMember.planned)
                            }
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                              staffMember.planned
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            Planned {staffMember.planned ? "ON" : "OFF"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void toggleSingleFeature(staffMember.id, "attendanceExceptionsEnabled", staffMember.exceptions)
                            }
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                              staffMember.exceptions
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            Exceptions {staffMember.exceptions ? "ON" : "OFF"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
                  No staff accounts match the filter criteria.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Feature Permissions Modal for Single Staff Member */}
        {permissionTarget && (
          <FeaturePermissionsModal
            isOpen={Boolean(permissionTarget)}
            onClose={() => setPermissionTarget(null)}
            staffId={permissionTarget.id}
            staffName={permissionTarget.name}
            onSave={(updated) => {
              const single = Array.isArray(updated) ? updated[0] : updated;
              if (!single?.staff_id) return;
              setStaffAccounts((accounts) =>
                accounts.map((account) =>
                  account.id === single.staff_id
                    ? {
                        ...account,
                        leave: single.leave_requests_enabled,
                        planned: single.planned_absence_enabled,
                        exceptions: single.attendance_exceptions_enabled,
                      }
                    : account,
                ),
              );
              setPermissionRows((rows) =>
                rows.map((row) =>
                  row.staff_id === single.staff_id
                    ? {
                        ...row,
                        leave_requests_enabled: single.leave_requests_enabled,
                        planned_absence_enabled: single.planned_absence_enabled,
                        attendance_exceptions_enabled: single.attendance_exceptions_enabled,
                      }
                    : row,
                ),
              );
            }}
          />
        )}

        {/* Section: Leave Requests */}
        {manager && (managerTab === "all" || managerTab === "requests") && (
          <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Leave requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review annual, sick, maternity, and other leave requests. Medical reports are stored privately.
            </p>
            <div className="mt-4 divide-y divide-border">
              {leaveRequests.filter((item) => item.status === "pending").length ? (
                leaveRequests
                  .filter((item) => item.status === "pending")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-foreground">
                          {item.staff_name || "Staff member"} · {item.leave_type}
                          {item.department ? ` (${item.department})` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.start_date} to {item.end_date}
                        </p>
                        <p className="mt-2 text-sm text-foreground">{item.reason}</p>
                        {item.medical_report_path && (
                          <a
                            className="mt-2 inline-block text-sm font-semibold text-primary underline"
                            href={`/api/attendance/leave/file?pathname=${encodeURIComponent(item.medical_report_path)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View medical report
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void decideLeave(item.id, "approved")}
                          className="min-h-10 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => void decideLeave(item.id, "denied")}
                          className="min-h-10 rounded-xl border border-destructive/40 px-3.5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="py-6 text-sm text-muted-foreground">No leave requests require review.</p>
              )}
            </div>
          </section>
        )}

        {/* Section: Planned Absence Requests */}
        {manager && (managerTab === "all" || managerTab === "requests") && (
          <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Planned absence requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Approve requests submitted before a staff member&apos;s absence so they are recorded as excused.
            </p>
            <div className="mt-4 divide-y divide-border">
              {permissionRequests.filter((item) => item.status === "pending").length ? (
                permissionRequests
                  .filter((item) => item.status === "pending")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-foreground">
                          {item.staff_name || "Staff member"}
                          {item.department ? ` (${item.department})` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.start_date} to {item.end_date}
                        </p>
                        <p className="mt-2 text-sm text-foreground">{item.reason}</p>
                        {item.handover_notes && (
                          <p className="mt-1 text-sm text-muted-foreground">Handover: {item.handover_notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void decidePermission(item.id, "approved")}
                          className="min-h-10 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => void decidePermission(item.id, "denied")}
                          className="min-h-10 rounded-xl border border-destructive/40 px-3.5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="py-6 text-sm text-muted-foreground">No planned absence requests require review.</p>
              )}
            </div>
          </section>
        )}

        {/* Section: Attendance Exceptions */}
        {manager && (managerTab === "all" || managerTab === "requests") && (
          <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Attendance exceptions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review staff explanations and record an approval, denial, or unlock.
            </p>
            <div className="mt-4 divide-y divide-border">
              {exceptions.length ? (
                exceptions.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {item.staff_name || "Staff member"}
                        {item.department ? ` (${item.department})` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.attendance_date} · {item.status}
                      </p>
                      {item.staff_reply && <p className="mt-2 text-sm text-foreground">Reply: {item.staff_reply}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void decideException(item.id, "approved")}
                        className="min-h-10 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void decideException(item.id, "denied")}
                        className="min-h-10 rounded-xl border border-destructive/40 px-3.5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
                      >
                        Deny
                      </button>
                      {(item.status === "approved" || item.status === "denied") && (
                        <button
                          onClick={() => void decideException(item.id, "resumed")}
                          className="min-h-10 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold transition hover:bg-muted"
                        >
                          Resume / Unlock
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-6 text-sm text-muted-foreground">No attendance exceptions require review.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{label}</span>
        <span className="h-5 w-5 text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}
