import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const ranges = { daily: 1, weekly: 7, monthly: 30, yearly: 365 } as const;

export async function GET(request: Request) {
  const { error } = await requireRole("admin", "manager");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") || "daily") as keyof typeof ranges;
  const days = ranges[range] || ranges.daily;

  try {
    const result = await query(`
      SELECT
        ar.id,
        ar.staff_id,
        CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name,
        sp.position,
        sp.department,
        ss.shift_date,
        ss.scheduled_start,
        ss.scheduled_end,
        ar.check_in_at,
        ar.check_out_at,
        ar.late_minutes,
        ar.early_checkout_minutes,
        ar.status,
        ar.verification_status,
        ar.verified_at,
        ar.notes,
        CASE
          WHEN ss.scheduled_start IS NULL THEN 'Unscheduled'
          WHEN EXTRACT(HOUR FROM ss.scheduled_start AT TIME ZONE 'Africa/Accra') < 10 THEN 'Early'
          WHEN EXTRACT(HOUR FROM ss.scheduled_start AT TIME ZONE 'Africa/Accra') < 14 THEN 'Mid'
          ELSE 'Late'
        END AS shift_period,
        CASE
          WHEN ar.check_in_at IS NULL THEN 'Absent'
          WHEN ar.late_minutes > 0 THEN 'Late'
          WHEN ar.check_out_at IS NULL THEN 'Incomplete'
          ELSE 'Present'
        END AS attendance_result
      FROM attendance_records ar
      LEFT JOIN staff_profiles sp ON sp.id = ar.staff_id
      LEFT JOIN staff_shifts ss ON ss.id = ar.shift_id
      WHERE ar.verification_status = 'verified'
        AND COALESCE(ss.shift_date, ar.created_at::date) >= CURRENT_DATE - ($1::int - 1)
      ORDER BY COALESCE(ss.shift_date, ar.created_at::date) DESC, ar.check_in_at DESC
      LIMIT 1000
    `, [days]);

    const summary = result.rows.reduce((acc, row) => {
      acc.total += 1;
      if (row.attendance_result === "Present") acc.present += 1;
      if (row.attendance_result === "Late") acc.late += 1;
      if (row.attendance_result === "Absent") acc.absent += 1;
      if (row.attendance_result === "Incomplete") acc.incomplete += 1;
      return acc;
    }, { total: 0, present: 0, late: 0, absent: 0, incomplete: 0 });

    return NextResponse.json({ range, summary, records: result.rows });
  } catch (cause) {
    console.error("[attendance] report load failed", cause);
    return NextResponse.json({ error: "Unable to load attendance report" }, { status: 500 });
  }
}

