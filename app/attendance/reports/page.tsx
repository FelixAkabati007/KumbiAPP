"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Download, FileBarChart2, Users, XCircle } from "lucide-react";

interface AttendanceRecord {
  id: string;
  staff_name: string;
  position: string | null;
  department: string | null;
  shift_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number | null;
  early_checkout_minutes: number | null;
  shift_period: string;
  attendance_result: string;
  verified_at: string | null;
}

const defaultSummary = { total: 0, present: 0, late: 0, absent: 0, incomplete: 0 };

const metricCards: Array<[string, keyof typeof defaultSummary, React.ComponentType<{ className?: string }>, string]> = [
  ["Total records", "total", Users, "text-primary"],
  ["Present", "present", CheckCircle2, "text-emerald-600"],
  ["Late", "late", Clock3, "text-amber-600"],
  ["Absent", "absent", XCircle, "text-destructive"],
  ["Incomplete", "incomplete", CalendarDays, "text-muted-foreground"],
];

const ranges = [
  ["daily", "Today"],
  ["weekly", "This week"],
  ["monthly", "This month"],
  ["yearly", "This year"],
] as const;

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GH", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
}

export default function AttendanceReportsPage() {
  const [range, setRange] = useState("daily");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState(defaultSummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/attendance/reports?range=${range}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load report");
        return body;
      })
      .then((body) => { if (active) { setRecords(body.records); setSummary(body.summary); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load report"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/attendance" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Attendance control center</Link>
            <div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><FileBarChart2 className="h-6 w-6" /></div><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Management report</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Attendance Register</h1></div></div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Approved attendance only. Review Early, Mid, and Late shift performance for management decisions.</p>
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"><Download className="h-4 w-4" /> Export / print</button>
        </header>

        <nav aria-label="Report period" className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-2">
          {ranges.map(([value, label]) => <button key={value} type="button" onClick={() => setRange(value)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${range === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</button>)}
        </nav>

        {error && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
        <section aria-label="Report summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {metricCards.map(([label, key, Icon, color]) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className={`h-4 w-4 ${color}`} /></div><p className="mt-2 text-2xl font-semibold">{summary[key]}</p></div>)}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-4"><div><h2 className="font-semibold">Approved attendance records</h2><p className="text-sm text-muted-foreground">Only records approved by management appear here.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{range}</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Report</th><th className="px-4 py-3">Checked out</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Approval</th></tr></thead><tbody className="divide-y divide-border">{loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading approved records...</td></tr> : records.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No approved attendance records for this period.</td></tr> : records.map((record) => <tr key={record.id} className="hover:bg-muted/30"><td className="px-4 py-3"><p className="font-semibold">{record.staff_name || "Unknown staff"}</p><p className="text-xs text-muted-foreground">{record.position || record.department || "Staff"}</p></td><td className="px-4 py-3">{formatDate(record.shift_date)}</td><td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{record.shift_period}</span></td><td className="px-4 py-3">{formatTime(record.check_in_at)}{record.late_minutes ? <span className="ml-2 text-xs text-destructive">+{record.late_minutes}m</span> : null}</td><td className="px-4 py-3">{formatTime(record.check_out_at)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${record.attendance_result === "Late" ? "bg-amber-500/10 text-amber-700" : record.attendance_result === "Present" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{record.attendance_result}</span></td><td className="px-4 py-3 text-xs text-muted-foreground">Verified {formatTime(record.verified_at)}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  );
}
