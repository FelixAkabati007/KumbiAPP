import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await query(
    `WITH due AS (
       SELECT DISTINCT ON (sp.user_id)
         sp.user_id,
         COALESCE(s.name, CONCAT(COALESCE(sp.position, 'Staff'), ' shift')) AS schedule_name,
         COALESCE(s.start_time, '08:00'::time) AS start_time,
         COALESCE(s.reminder_minutes, 20) AS reminder_minutes
       FROM staff_profiles sp
       LEFT JOIN staff_schedule_assignments a
         ON a.staff_id = sp.id
        AND a.work_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date
        AND a.status <> 'cancelled'
       LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
       WHERE sp.user_id IS NOT NULL
         AND COALESCE(sp.status, 'active') = 'active'
       ORDER BY sp.user_id, a.created_at DESC NULLS LAST
     ), created AS (
       INSERT INTO notifications (recipient_user_id, title, message, type)
       SELECT due.user_id,
              'Shift reminder',
              CONCAT(due.schedule_name, ' starts in ', due.reminder_minutes, ' minutes. Reporting time is ', to_char(due.start_time, 'HH12:MI AM'), '.'),
              'shift_reminder'
       FROM due
       WHERE (CURRENT_TIME AT TIME ZONE 'Africa/Accra') >= due.start_time - make_interval(mins => due.reminder_minutes)
         AND (CURRENT_TIME AT TIME ZONE 'Africa/Accra') < due.start_time - make_interval(mins => due.reminder_minutes) + interval '2 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.recipient_user_id = due.user_id
             AND n.type = 'shift_reminder'
             AND n.created_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date
         )
       RETURNING id
     ) SELECT COUNT(*)::int AS created_count FROM created`,
  );

  return NextResponse.json({ created: Number(result.rows[0]?.created_count ?? 0) });
}
