import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const cronAuthorized = Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const { session, error } = cronAuthorized ? { session: { id: "cron", role: "admin" }, error: null } : await requireRole("admin", "manager", "operationsManager");
  if (error) return error;

  const canonicalNow = await getCanonicalTransactionTimestamp();
  try {
    const result = await query(
      `WITH due AS (
         SELECT ar.id
         FROM attendance_records ar
         JOIN staff_profiles sp ON sp.id = ar.staff_id
         LEFT JOIN staff_schedule_assignments a
           ON a.staff_id = ar.staff_id
          AND a.work_date = (timezone('Africa/Accra', $1::timestamptz))::date
          AND a.status <> 'cancelled'
         LEFT JOIN LATERAL (
           SELECT ws.end_time
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
         WHERE ar.check_in_at IS NOT NULL
           AND ar.check_out_at IS NULL
           AND COALESCE(s.end_time, '18:00'::time) <= (timezone('Africa/Accra', $1::timestamptz))::time
           AND ar.created_at::date = (timezone('Africa/Accra', $1::timestamptz))::date
       )
       UPDATE attendance_records ar
       SET check_out_at = $1::timestamptz,
           status = 'auto_checked_out',
           updated_at = $1::timestamptz,
           notes = CONCAT_WS(' ', ar.notes, 'Automatically checked out at scheduled shift end.')
       FROM due
       WHERE ar.id = due.id
       RETURNING ar.id, ar.staff_id, ar.check_out_at`,
      [canonicalNow],
    );

    return NextResponse.json({ apiVersion: "2", updated: result.rowCount ?? 0, records: result.rows, actorId: session.id }, { headers: { "X-API-Version": "2", "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("[attendance] automatic checkout failed", cause);
    return NextResponse.json({ apiVersion: "2", error: "Unable to complete scheduled checkout" }, { status: 500, headers: { "X-API-Version": "2" } });
  }
}

export function OPTIONS() {
  return NextResponse.json({ apiVersion: "2", status: "ok" }, { headers: { "X-API-Version": "2" } });
}
