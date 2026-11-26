import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { managementRoles } from "@/lib/roles";
import { ensureAttendanceSchema } from "@/lib/attendance-service";
import { resolveWorkforceSchedule } from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

const ranges = { daily: 1, weekly: 7, monthly: 30, yearly: 365 } as const;

function computeShiftPeriod(startTime?: string | null): string {
  if (!startTime) return "Unscheduled";
  const hour = Number(String(startTime).split(":")[0]);
  if (!Number.isFinite(hour)) return "Unscheduled";
  if (hour < 10) return "Early";
  if (hour < 14) return "Mid";
  return "Late";
}

interface ReportRecordQueryRow {
  id: string;
  staff_id: string | null;
  user_id: string | null;
  staff_name: string | null;
  position: string | null;
  job_classification: string | null;
  department: string | null;
  staff_role: string | null;
  shift_date: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_checkout_minutes: number;
  status: string | null;
  verification_status: string | null;
  verified_at: string | null;
  notes: string | null;
  attendance_result: string;
}

export async function GET(request: Request) {
  const { error } = await requireRole(...managementRoles);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") || "daily") as keyof typeof ranges;
  const days = ranges[range] || ranges.daily;

  try {
    await ensureAttendanceSchema();

    const result = await query<ReportRecordQueryRow>(
      `SELECT
         ar.id,
         ar.staff_id,
         ar.user_id,
         COALESCE(
           NULLIF(NULLIF(TRIM(u.name), ''), 'Staff member'),
           NULLIF(CONCAT_WS(' ', NULLIF(TRIM(sp.first_name), ''), NULLIF(TRIM(sp.last_name), '')), ''),
           NULLIF(TRIM(u.email), ''),
           ar.staff_id::text
         ) AS staff_name,
         sp.position,
         sp.job_classification,
         sp.department,
         COALESCE(u.role::text, 'staff') AS staff_role,
         (timezone('Africa/Accra', COALESCE(ar.check_in_at, ar.created_at)))::date::text AS shift_date,
         ar.check_in_at,
         ar.check_out_at,
         COALESCE(ar.late_minutes, 0) AS late_minutes,
         COALESCE(ar.early_checkout_minutes, 0) AS early_checkout_minutes,
         ar.status,
         ar.verification_status,
         ar.verified_at,
         ar.notes,
         CASE
           WHEN ar.check_in_at IS NULL THEN 'Absent'
           WHEN COALESCE(ar.late_minutes, 0) > 0 OR ar.verification_status IN ('late', 'approved_late') THEN 'Late'
           WHEN ar.check_out_at IS NULL THEN 'Incomplete'
           ELSE 'Present'
         END AS attendance_result
       FROM attendance_records ar
       LEFT JOIN LATERAL (
         SELECT sp_inner.*
         FROM staff_profiles sp_inner
         WHERE sp_inner.id = ar.staff_id
            OR sp_inner.user_id = COALESCE(ar.user_id, ar.staff_id)
         ORDER BY (sp_inner.id = ar.staff_id) DESC, sp_inner.updated_at DESC NULLS LAST
         LIMIT 1
       ) sp ON true
       LEFT JOIN users u ON u.id = COALESCE(ar.user_id, sp.user_id, ar.staff_id)
       WHERE ar.verification_status IN ('verified', 'approved', 'late', 'approved_late', 'absent')
         AND (timezone('Africa/Accra', COALESCE(ar.check_in_at, ar.created_at)))::date >=
             (timezone('Africa/Accra', now()))::date - ($1::int - 1)
       ORDER BY COALESCE(ar.check_in_at, ar.created_at) DESC
       LIMIT 1000`,
      [days],
    );

    const scheduleCache = new Map<string, Promise<Awaited<ReturnType<typeof resolveWorkforceSchedule>> | null>>();
    const records = await Promise.all(
      result.rows.map(async (row) => {
        const targetId = String(row.user_id || row.staff_id || "");
        const refIso = row.shift_date ? `${String(row.shift_date)}T12:00:00.000Z` : new Date().toISOString();
        const cacheKey = `${targetId}:${row.shift_date ?? ""}`;
        let pendingSchedule = scheduleCache.get(cacheKey);
        if (!pendingSchedule) {
          pendingSchedule = targetId
            ? resolveWorkforceSchedule(
                targetId,
                refIso,
                undefined,
                row.staff_role ? String(row.staff_role) : undefined,
                row.department ? String(row.department) : undefined,
              ).catch(() => null)
            : Promise.resolve(null);
          scheduleCache.set(cacheKey, pendingSchedule);
        }
        const schedule = await pendingSchedule;
        const scheduledStart = schedule?.start_time ?? null;
        const scheduledEnd = schedule?.end_time ?? null;

        return {
          ...row,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          shift_period: computeShiftPeriod(scheduledStart),
        };
      }),
    );

    const summary = records.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.attendance_result === "Present") acc.present += 1;
        if (row.attendance_result === "Late") acc.late += 1;
        if (row.attendance_result === "Absent") acc.absent += 1;
        if (row.attendance_result === "Incomplete") acc.incomplete += 1;
        return acc;
      },
      { total: 0, present: 0, late: 0, absent: 0, incomplete: 0 },
    );

    return NextResponse.json({ range, summary, records });
  } catch (cause) {
    console.error("[attendance] report load failed", cause);
    return NextResponse.json({ error: "Unable to load attendance report" }, { status: 500 });
  }
}

