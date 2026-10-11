import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await query(
      `WITH target AS (
         SELECT sp.user_id, COALESCE(s.name, CONCAT(sp.position, ' standard')) AS schedule_name,
                COALESCE(s.start_time, '06:00'::time) AS start_time,
                COALESCE(s.reminder_minutes, 20) AS reminder_minutes
         FROM staff_profiles sp
         LEFT JOIN staff_schedule_assignments a ON a.staff_id = sp.id AND a.work_date = CURRENT_DATE AND a.status <> 'cancelled'
         LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
         WHERE sp.employment_status = 'active' AND sp.user_id IS NOT NULL
       ), created AS (
         INSERT INTO notifications (recipient_user_id, title, message, type)
         SELECT user_id, 'Shift reminder', CONCAT(schedule_name, ' starts in ', reminder_minutes, ' minutes. Reporting time is ', to_char(start_time, 'HH12:MI AM'), '.'), 'shift_reminder'
         FROM target
         WHERE (CURRENT_TIME AT TIME ZONE 'Africa/Accra') BETWEEN (start_time - make_interval(mins => reminder_minutes)) AND (start_time - make_interval(mins => reminder_minutes) + interval '2 minutes')
           AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.recipient_user_id = target.user_id AND n.type = 'shift_reminder' AND n.created_at::date = CURRENT_DATE)
         RETURNING id
       ) SELECT COUNT(*)::int AS created_count FROM created`,
    );
    return NextResponse.json({ apiVersion: "2", created: Number(result.rows[0]?.created_count ?? 0) }, { headers: { "X-API-Version": "2" } });
  } catch (cause) {
    console.error("[v2/workforce] scheduled reminder failed", cause);
    return NextResponse.json({ apiVersion: "2", error: "Unable to run shift reminders" }, { status: 500 });
  }
}
