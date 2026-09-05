import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function formatTime(value: string | null) {
  if (!value) return null;
  return value.slice(0, 5);
}

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const result = await query(
      `       SELECT
         COALESCE(a.work_date, CURRENT_DATE) AS work_date,
         COALESCE(s.name, CONCAT(COALESCE(sp.job_classification, sp.position, 'Staff'), ' standard')) AS schedule_name,
         COALESCE(s.job_classification, sp.job_classification, sp.position, 'Staff') AS job_classification,
         COALESCE(s.department, sp.department, 'Operations') AS department,
         COALESCE(s.shift_period, 'standard') AS shift_period,
         COALESCE(s.start_time, CASE
           WHEN LOWER(COALESCE(sp.job_classification, sp.position, 'staff')) IN ('reception', 'front desk', 'frontdesk') THEN '07:00'::time
           WHEN LOWER(COALESCE(sp.job_classification, sp.position, 'staff')) IN ('chef', 'kitchen') THEN '08:00'::time
           ELSE '06:00'::time
         END) AS start_time,
         COALESCE(s.end_time, CASE
           WHEN LOWER(COALESCE(sp.position, 'staff')) IN ('reception', 'front desk', 'frontdesk') THEN '19:00'::time
           WHEN LOWER(COALESCE(sp.position, 'staff')) = 'chef' THEN '20:30'::time
           WHEN LOWER(COALESCE(sp.position, 'staff')) = 'housekeeping' THEN '19:00'::time
           ELSE '18:00'::time
         END) AS end_time,
         COALESCE(s.reminder_minutes, 20) AS reminder_minutes,
         COALESCE(a.status, 'default') AS assignment_status
       FROM staff_profiles sp
       LEFT JOIN staff_schedule_assignments a
         ON a.staff_id = sp.id AND a.work_date = CURRENT_DATE AND a.status <> 'cancelled'
       LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
       WHERE sp.user_id = $1 OR sp.id = $1
       ORDER BY CASE WHEN sp.user_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [session.id],
    );

    const schedule = result.rows[0];
    if (!schedule) return NextResponse.json({ schedule: null });
    return NextResponse.json({
      schedule: {
        ...schedule,
        start_time: formatTime(schedule.start_time),
        end_time: formatTime(schedule.end_time),
      },
    });
  } catch (cause) {
    console.error("[workforce] schedule lookup failed", cause);
    return NextResponse.json({ error: "Unable to load today’s schedule" }, { status: 500 });
  }
}
