"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function AttendanceWorkspace({ eventId }: { eventId: string }) {
  const [records, setRecords] = useState<Array<{ id: string; user_id: string; clock_in: string; clock_out?: string | null; status: string; is_out_of_bounds: boolean }>>([]);
  const [queued, setQueued] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const response = await fetch(`/api/attendance?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });
    const data = await response.json();
    setRecords(data.attendance ?? []);
  };

  useEffect(() => { void load(); }, [eventId]);

  const clock = async (action: "clock_in" | "clock_out", attendanceId?: string) => {
    setLoading(true);
    try {
      const position = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 3000 });
      });
      const payload = { eventId, action, attendanceId, latitude: position?.coords.latitude ?? null, longitude: position?.coords.longitude ?? null };
      const response = await fetch("/api/attendance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("Attendance request failed");
      setQueued(false);
      await load();
    } catch {
      const pending = JSON.parse(window.localStorage.getItem("kumbi-attendance-queue") ?? "[]");
      pending.push({ eventId, action, attendanceId, queuedAt: new Date().toISOString() });
      window.localStorage.setItem("kumbi-attendance-queue", JSON.stringify(pending));
      setQueued(true);
    } finally { setLoading(false); }
  };

  return <div className="grid gap-4">
    {queued && <p role="status" className="rounded-xl border border-border bg-muted p-3 text-sm">Attendance is queued locally and will retry when the connection is restored.</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={loading} onClick={() => void clock("clock_in")}>Clock in</Button><Button variant="outline" disabled={loading} onClick={() => void clock("clock_out", records.find((record) => !record.clock_out)?.id)}>Clock out</Button></div>
    {!records.length ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No attendance records yet.</p> : <div className="grid gap-2">{records.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"><span>{new Date(record.clock_in).toLocaleString()}</span><span>{record.clock_out ? `Out ${new Date(record.clock_out).toLocaleString()}` : "Open"}</span><span>{record.is_out_of_bounds ? "Out of bounds" : record.status}</span></div>)}</div>}
  </div>;
}

export default AttendanceWorkspace;
