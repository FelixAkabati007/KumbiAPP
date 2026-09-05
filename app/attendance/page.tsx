"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, LogIn, LogOut, ShieldCheck, Users } from "lucide-react";

interface RecordRow { id: string; staff_id?: string; staff_name?: string; position?: string; check_in_at?: string; check_out_at?: string; status: string; verification_status: string; verified_at?: string; shift_period?: string }
interface ManagerData { pending: RecordRow[]; summary?: { present: string; pending: string; absent: string }; frequency: { staff_id: string; verified_days: string; recorded_days: string }[] }

function formatTime(value?: string) { return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"; }

export default function AttendancePage() {
  const [record, setRecord] = useState<RecordRow | null>(null);
  const [manager, setManager] = useState<ManagerData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const statusResponse = await fetch("/api/attendance");
    if (statusResponse.status === 401 || statusResponse.status === 403) {
      setAccessDenied(true);
      setMessage("Administrators do not use the staff attendance register. Return to the dashboard to continue.");
      setLoading(false);
      return;
    }
    const status = statusResponse.ok ? await statusResponse.json() : null;
    setAccessDenied(false);
    setRecord(status?.record ?? null);
    const review = await fetch("/api/attendance/manager");
    if (review.ok) setManager(await review.json());
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function register(action: "check_in" | "check_out") {
    setBusy(true); setMessage("");
    const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json();
    setMessage(response.ok ? "Register updated. Manager verification is pending." : response.status === 401 || response.status === 403 ? "Sign in with a staff account to use the attendance register." : data.error ?? "Unable to update register");
    setAccessDenied(response.status === 401 || response.status === 403);
    setBusy(false); if (response.ok) void load();
  }
  async function decide(id: string, status: "verified" | "late" | "rejected") {
    await fetch("/api/attendance/manager", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    void load();
  }

  const open = Boolean(record?.check_in_at && !record.check_out_at);
  return <main className="min-h-screen overflow-x-hidden bg-muted/30 p-3 text-foreground sm:p-4 md:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-4">
        <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        <div><p className="text-sm font-medium text-primary">Workforce operations</p><h1 className="responsive-heading font-bold tracking-tight">Register</h1><p className="important-description mt-2 text-sm">Record your shift attendance and keep the monthly performance score accurate.</p></div>
      </header>
      <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-6 w-6" /></div><div><h2 className="text-xl font-semibold">Today&apos;s register</h2><p className="mt-1 text-sm text-muted-foreground">Check-in is timestamped immediately and confirmed by a manager before attendance points are awarded.</p><p className="mt-3 text-sm text-muted-foreground">Status: <span className="font-semibold text-foreground">{loading ? "Loading…" : record?.verification_status ?? "Not checked in"}</span> · In {formatTime(record?.check_in_at)} · Out {formatTime(record?.check_out_at)}</p></div></div>{!accessDenied && <div className="grid w-full gap-2 sm:grid-cols-2 lg:flex lg:w-auto"><button disabled={busy || open} onClick={() => void register("check_in")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"><LogIn className="h-4 w-4" />Check In</button><button disabled={busy || !open} onClick={() => void register("check_out")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 py-3 font-semibold disabled:opacity-50"><LogOut className="h-4 w-4" />Check Out</button></div>}
        </div>
        {message && <div role="status" className={`mt-4 rounded-xl border p-3 text-sm ${accessDenied ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border bg-muted text-foreground"}`}>{message}</div>}
      </section>
      {manager && <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h2 className="text-2xl font-semibold">Attendance control center</h2></div><Link href="/attendance/reports" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold transition hover:bg-muted"><CheckCircle2 className="h-4 w-4 text-primary" /> Open approved report</Link></div><div className="grid gap-4 sm:grid-cols-3"><Metric label="Present today" value={manager.summary?.present ?? "0"} icon={<CheckCircle2 />} /><Metric label="Pending review" value={manager.summary?.pending ?? "0"} icon={<Clock3 />} /><Metric label="Absent records" value={manager.summary?.absent ?? "0"} icon={<Users />} /></div><div className="rounded-2xl border bg-background p-5"><h3 className="font-semibold">Pending confirmations</h3><div className="mt-3 divide-y">{manager.pending.length ? manager.pending.map((item) => <div key={item.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between"><div><p className="font-medium">{item.staff_name || `Staff ${item.staff_id}`}</p><p className="text-sm text-muted-foreground">{item.position || "Staff"} · Checked in at {formatTime(item.check_in_at)}</p><span className="mt-2 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{item.shift_period || "Unscheduled"} shift</span></div><div className="flex flex-wrap gap-2"><button onClick={() => void decide(item.id, "verified")} className="min-h-10 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Confirm present</button><button onClick={() => void decide(item.id, "late")} className="min-h-10 rounded-lg border px-3 py-2 text-sm">Mark late</button><button onClick={() => void decide(item.id, "rejected")} className="min-h-10 rounded-lg border px-3 py-2 text-sm">Reject</button></div></div>) : <p className="py-4 text-sm text-muted-foreground">No pending confirmations.</p>}</div></div></section>}
    </div>
  </main>
}
function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-2xl border bg-background p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{label}</span><span className="h-5 w-5 text-primary">{icon}</span></div><p className="mt-2 text-3xl font-bold">{value}</p></div> }
