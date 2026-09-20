import { transaction } from "@/lib/db";
import type { ApiSession } from "@/lib/api-auth";
import { propertyDayExpression } from "@/lib/operational-day";

export type AttendanceAction = "check_in" | "check_out";

export async function registerAttendance(session: ApiSession, action: AttendanceAction, notes?: string) {
  return transaction(async (client) => {
    const current = await client.query(
      `SELECT id, check_in_at, check_out_at
       FROM attendance_records
       WHERE staff_id = $1 AND created_at::date = ${propertyDayExpression()}
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [session.id],
    );
    const record = current.rows[0];

    if (action === "check_in") {
      if (record?.check_in_at && !record.check_out_at) throw new Error("ALREADY_CHECKED_IN");
      const inserted = await client.query(
        `INSERT INTO attendance_records (staff_id, check_in_at, status, verification_status, notes)
         VALUES ($1, now(), 'pending_verification', 'pending', $2) RETURNING *`,
        [session.id, notes?.slice(0, 500) ?? null],
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO attendance_policy_events (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
         VALUES ($1, $2, 'check_in', $2, $3, $4::jsonb)`,
        [row.id, session.id, `attendance:${row.id}:check_in`, JSON.stringify({ source: "attendance_service" })],
      );
      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         VALUES ('attendance.checked_in', 'attendance_record', $1, $2, $3::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [row.id, `attendance:${row.id}:checked_in`, JSON.stringify({ attendanceRecordId: row.id, staffId: session.id })],
      );
      return { record: row, nextAction: "check_out" as const };
    }

    if (!record?.check_in_at || record.check_out_at) throw new Error("CHECK_IN_REQUIRED");

    const schedule = await client.query(
      `SELECT COALESCE(s.end_time, CASE
         WHEN LOWER(COALESCE(sp.position, sp.job_classification, 'staff')) IN ('reception', 'front desk', 'frontdesk') THEN '19:00'::time
         WHEN LOWER(COALESCE(sp.position, sp.job_classification, 'staff')) = 'chef' THEN '20:30'::time
         WHEN LOWER(COALESCE(sp.position, sp.job_classification, 'staff')) = 'housekeeping' THEN '19:00'::time
         ELSE '18:00'::time
       END) AS end_time
       FROM staff_profiles sp
       LEFT JOIN staff_schedule_assignments a ON a.staff_id = sp.id AND a.work_date = ${propertyDayExpression()} AND a.status <> 'cancelled'
       LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
       WHERE sp.user_id = $1 OR sp.id = $1
       ORDER BY CASE WHEN sp.user_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [session.id],
    );
    const scheduledEnd = schedule.rows[0]?.end_time;
    if (scheduledEnd) {
      const timeCheck = await client.query(
        `SELECT CURRENT_TIME >= $1::time AS allowed`,
        [scheduledEnd],
      );
      if (!timeCheck.rows[0]?.allowed) throw new Error("CHECKOUT_TOO_EARLY");
    }

    const updated = await client.query(
      `UPDATE attendance_records
       SET check_out_at = now(), status = 'checked_out', updated_at = now()
       WHERE id = $1 AND check_out_at IS NULL RETURNING *`,
      [record.id],
    );
    if (!updated.rows[0]) throw new Error("ALREADY_CHECKED_OUT");
    const row = updated.rows[0];
    await client.query(
      `INSERT INTO attendance_policy_events (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
       VALUES ($1, $2, 'check_out', $2, $3, $4::jsonb)`,
      [row.id, session.id, `attendance:${row.id}:check_out`, JSON.stringify({ source: "attendance_service" })],
    );
    await client.query(
      `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
       VALUES ('attendance.checked_out', 'attendance_record', $1, $2, $3::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [row.id, `attendance:${row.id}:checked_out`, JSON.stringify({ attendanceRecordId: row.id, staffId: session.id })],
    );
    return { record: row, nextAction: "complete" as const };
  });
}
