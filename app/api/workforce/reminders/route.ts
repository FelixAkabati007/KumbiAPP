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
         LEFT JOIN LATERAL (
           SELECT ws.name, ws.start_time, ws.reminder_minutes
           FROM work_schedules ws
           WHERE ws.is_active = true
             AND (
               ws.id = a.schedule_id
               OR (a.schedule_id IS NULL AND (
                 LOWER(TRIM(ws.job_classification)) = LOWER(TRIM(COALESCE(sp.job_classification, '')))
                 OR LOWER(TRIM(ws.job_classification)) = LOWER(TRIM(COALESCE(sp.position, '')))
                 OR LOWER(REGEXP_REPLACE(ws.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE(COALESCE(sp.job_classification, sp.position, ''), '[^a-z0-9]', '', 'g'))
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('waiterwaitress', 'waiter', 'waitress', 'server') OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%waiter%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%waitress%')
                   AND (LOWER(ws.job_classification) LIKE '%waiter%' OR LOWER(ws.job_classification) LIKE '%waitress%' OR LOWER(ws.job_classification) LIKE '%server%' OR LOWER(ws.name) LIKE '%waiter%' OR LOWER(ws.name) LIKE '%waitress%')
                 )
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('kitchen', 'chef') OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%chef%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%cook%')
                   AND (LOWER(ws.job_classification) LIKE '%chef%' OR LOWER(ws.job_classification) LIKE '%kitchen%' OR LOWER(ws.job_classification) LIKE '%cook%' OR LOWER(ws.name) LIKE '%chef%')
                 )
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('frontdesk', 'reception', 'front desk') OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%reception%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%front desk%')
                   AND (LOWER(ws.job_classification) LIKE '%reception%' OR LOWER(ws.job_classification) LIKE '%front desk%' OR LOWER(ws.job_classification) LIKE '%frontdesk%' OR LOWER(ws.name) LIKE '%reception%')
                 )
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('restaurantfrontdesk', 'restaurantpos') OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%pos%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%cashier%')
                   AND (LOWER(ws.job_classification) LIKE '%pos%' OR LOWER(ws.job_classification) LIKE '%cashier%' OR LOWER(ws.job_classification) LIKE '%restaurant front desk%')
                 )
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%housekeep%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%clean%')
                   AND (LOWER(ws.job_classification) LIKE '%housekeep%' OR LOWER(ws.job_classification) LIKE '%clean%')
                 )
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%secur%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%guard%')
                   AND (LOWER(ws.job_classification) LIKE '%secur%' OR LOWER(ws.job_classification) LIKE '%guard%')
                 )
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%labour%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%labor%' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%maint%')
                   AND (LOWER(ws.job_classification) LIKE '%labour%' OR LOWER(ws.job_classification) LIKE '%labor%' OR LOWER(ws.job_classification) LIKE '%maint%')
                 )
                 OR (
                   (LOWER(COALESCE(sp.job_classification, sp.position, '')) = 'staff' OR LOWER(COALESCE(sp.job_classification, sp.position, '')) LIKE '%staff%')
                   AND (LOWER(ws.job_classification) LIKE '%staff%' OR LOWER(ws.name) LIKE '%staff%')
                 )
               ))
             )
           ORDER BY
             CASE WHEN ws.id = a.schedule_id THEN 0 ELSE 1 END,
             CASE
               WHEN LOWER(TRIM(ws.department)) = LOWER(TRIM(COALESCE(sp.department, ''))) THEN 0
               WHEN LOWER(TRIM(ws.department)) LIKE CONCAT('%', LOWER(TRIM(COALESCE(sp.department, ''))), '%') THEN 1
               ELSE 2
             END,
             COALESCE(ws.updated_at, ws.created_at) DESC,
             ws.created_at DESC
           LIMIT 1
         ) s ON true
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
