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
                 OR (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('kitchen', 'chef') AND LOWER(TRIM(ws.job_classification)) = 'chef')
                 OR (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('frontdesk', 'reception', 'front desk') AND LOWER(TRIM(ws.job_classification)) = 'reception')
                 OR (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('restaurantfrontdesk', 'restaurantpos') AND LOWER(TRIM(ws.job_classification)) = 'restaurant front desk / pos')
                 OR (LOWER(COALESCE(sp.job_classification, sp.position, '')) IN ('waiterwaitress', 'waiter', 'waitress') AND LOWER(TRIM(ws.job_classification)) = 'waiter/waitress')
                 OR (LOWER(COALESCE(sp.job_classification, sp.position, '')) = 'housekeeping' AND LOWER(TRIM(ws.job_classification)) = 'housekeeping')
                 OR (LOWER(COALESCE(sp.job_classification, sp.position, '')) = 'staff' AND LOWER(TRIM(ws.job_classification)) = 'staff')
               ))
             )
           ORDER BY CASE WHEN ws.id = a.schedule_id THEN 0 ELSE 1 END, ws.created_at ASC
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
