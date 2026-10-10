import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { propertyDayExpression } from "@/lib/operational-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await transaction(async (client) => {
    const stale = await client.query(
      `UPDATE attendance_records
       SET status = 'auto_closed', updated_at = now(), notes = CONCAT_WS(' ', notes, 'Auto-closed at operational day boundary.')
       WHERE check_in_at IS NOT NULL
         AND check_out_at IS NULL
         AND (
           created_at::date < ${propertyDayExpression()}
           OR EXISTS (
             SELECT 1
             FROM staff_profiles sp
             LEFT JOIN staff_schedule_assignments a ON a.staff_id = sp.id AND a.work_date = ${propertyDayExpression()} AND a.status <> 'cancelled'
             LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
             WHERE (sp.id = attendance_records.staff_id OR sp.user_id = attendance_records.staff_id)
               AND COALESCE(s.end_time, CASE
                 WHEN LOWER(COALESCE(sp.position, sp.job_classification, 'staff')) IN ('reception', 'front desk', 'frontdesk', 'housekeeping') THEN '19:00'::time
                 WHEN LOWER(COALESCE(sp.position, sp.job_classification, 'staff')) = 'chef' THEN '20:30'::time
                 ELSE '18:00'::time
               END) <= (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::time
           )
         )
       RETURNING id, staff_id`,
    );
    for (const record of stale.rows) {
      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         VALUES ('attendance.auto_closed', 'attendance', $1, $2, $3::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [record.id, `attendance-auto-closed:${record.id}`, JSON.stringify({ staffId: record.staff_id })],
      );
    }
    return stale.rows.length;
  });

  const pending = await query(`SELECT count(*)::int AS count FROM operational_outbox WHERE status = 'pending'`);
  return NextResponse.json({ staleAttendanceClosed: result, pendingOutbox: pending.rows[0]?.count ?? 0 });
}
