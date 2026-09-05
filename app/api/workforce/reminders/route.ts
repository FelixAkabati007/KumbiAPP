import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const body = await request.json().catch(() => ({}));
    const staffId = typeof body.staffId === "string" ? body.staffId : session.id;
    if (staffId !== session.id && !["admin", "manager", "hotelManager", "restaurantManager", "operationsManager"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const inserted = await query(
      `WITH target AS (
         SELECT sp.user_id, COALESCE(s.name, CONCAT(sp.position, ' standard')) AS schedule_name,
                COALESCE(s.start_time, CASE
                  WHEN LOWER(COALESCE(sp.position, 'staff')) IN ('reception', 'front desk', 'frontdesk') THEN '07:00'::time
                  WHEN LOWER(COALESCE(sp.position, 'staff')) = 'chef' THEN '08:00'::time
                  ELSE '06:00'::time
                END) AS start_time,
                COALESCE(s.reminder_minutes, 20) AS reminder_minutes
         FROM staff_profiles sp
         LEFT JOIN staff_schedule_assignments a ON a.staff_id = sp.id AND a.work_date = CURRENT_DATE AND a.status <> 'cancelled'
         LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
         WHERE sp.user_id = $1 OR sp.id = $1
         ORDER BY CASE WHEN sp.user_id = $1 THEN 0 ELSE 1 END
         LIMIT 1
       ), created AS (
         INSERT INTO notifications (recipient_user_id, title, message, type)
         SELECT user_id, 'Shift reminder', CONCAT(schedule_name, ' starts in ', reminder_minutes, ' minutes. Reporting time is ', to_char(start_time, 'HH12:MI AM'), '.'), 'shift_reminder'
         FROM target
         WHERE (CURRENT_TIME AT TIME ZONE 'Africa/Accra') BETWEEN (start_time - make_interval(mins => reminder_minutes)) AND (start_time - make_interval(mins => reminder_minutes) + interval '2 minutes')
           AND NOT EXISTS (
             SELECT 1 FROM notifications n
             WHERE n.recipient_user_id = target.user_id AND n.type = 'shift_reminder' AND n.created_at::date = CURRENT_DATE
           )
         RETURNING id
       ) SELECT COUNT(*)::int AS created_count FROM created`,
      [staffId],
    );

    return NextResponse.json({ created: Number(inserted.rows[0]?.created_count ?? 0) });
  } catch (cause) {
    console.error("[workforce] reminder creation failed", cause);
    return NextResponse.json({ error: "Unable to create shift reminder" }, { status: 500 });
  }
}
