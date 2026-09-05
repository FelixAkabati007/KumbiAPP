"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Clock3, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

interface AttendanceRecord {
  check_in_at?: string;
  check_out_at?: string;
  verification_status?: string;
}

interface WorkSchedule {
  schedule_name: string;
  job_classification: string;
  department: string;
  shift_period: string;
  start_time: string;
  end_time: string;
  reminder_minutes: number;
  assignment_status: string;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function StaffPage() {
  const { user, isLoading } = useAuth();
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [attendanceResponse, scheduleResponse] = await Promise.all([
      fetch("/api/attendance"),
      fetch("/api/workforce/schedule"),
    ]);
    if (attendanceResponse.ok) setRecord((await attendanceResponse.json()).record ?? null);
    if (scheduleResponse.ok) setSchedule((await scheduleResponse.json()).schedule ?? null);
  }

  useEffect(() => {
    if (!isLoading && !user) window.location.assign("/login");
    if (!isLoading && user && user.role !== "staff") window.location.assign("/");
    if (!isLoading && user?.role === "staff") void load();
  }, [isLoading, user]);

  async function register(action: "check_in" | "check_out") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Attendance updated successfully." : data.error ?? "Unable to update attendance.");
    if (response.ok) await load();
    setBusy(false);
  }

  if (isLoading || !user || user.role !== "staff") return null;

  const open = Boolean(record?.check_in_at && !record.check_out_at);
  return (
    <main className="min-h-screen bg-muted/30 p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-4">
          <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold transition hover:bg-muted">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to dashboard
          </Link>
          <div>
            <p className="text-sm font-medium text-primary">Staff workspace</p>
            <h1 className="text-3xl font-bold tracking-tight">Staff Attendance</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Use this page to record your shift start and finish.</p>
          </div>
        </header>
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-background p-3 text-primary"><CalendarDays className="h-6 w-6" aria-hidden="true" /></div>
            <div><h2 className="text-xl font-semibold">Today&apos;s schedule</h2><p className="mt-1 text-sm text-muted-foreground">Your reminder is sent 20 minutes before reporting time.</p></div>
          </div>
          {schedule ? <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p><p className="mt-1 font-semibold">{schedule.job_classification}</p></div><div className="rounded-xl border border-border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Report</p><p className="mt-1 font-semibold">{schedule.start_time}</p></div><div className="rounded-xl border border-border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Close</p><p className="mt-1 font-semibold">{schedule.end_time}</p></div></div> : <p className="mt-5 rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">No schedule assigned for today.</p>}
        </section>
        <section className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div>
            <div><h2 className="text-xl font-semibold">Today&apos;s attendance</h2><p className="mt-1 text-sm text-muted-foreground">Your manager will review the recorded attendance.</p></div>
          </div>
          <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm">Status: <span className="font-semibold">{record?.verification_status ?? "Not checked in"}</span><span className="mx-2 text-muted-foreground">·</span>In {formatTime(record?.check_in_at)}<span className="mx-2 text-muted-foreground">·</span>Out {formatTime(record?.check_out_at)}</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button disabled={busy || open} onClick={() => void register("check_in")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"><LogIn className="h-4 w-4" /> Check in</button>
            <button disabled={busy || !open} onClick={() => void register("check_out")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 py-3 font-semibold disabled:opacity-50"><LogOut className="h-4 w-4" /> Check out</button>
          </div>
          {message && <p role="status" className="mt-4 rounded-xl border border-border bg-muted p-3 text-sm">{message}</p>}
        </section>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" aria-hidden="true" /> Attendance times are recorded automatically.</div>
      </div>
    </main>
  );
}
