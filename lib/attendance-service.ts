import { transaction } from "@/lib/db";
import type { ApiSession } from "@/lib/api-auth";
import { managementRoles } from "@/lib/roles";
import { propertyDayExpression } from "@/lib/operational-day";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";

export type AttendanceAction = "check_in" | "check_out";

export async function registerAttendance(session: ApiSession, action: AttendanceAction, notes?: string) {
  if (action === "check_in" && managementRoles.includes(session.role)) {
    throw new Error("MANAGERIAL_ROLE_CHECK_IN_FORBIDDEN");
  }
  const canonicalNow = await getCanonicalTransactionTimestamp();
  return transaction(async (client) => {
    const identity = await client.query<{ staff_id: string }>(
      `SELECT id AS staff_id
       FROM staff_profiles
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [session.id],
    );
    const staffId = identity.rows[0]?.staff_id;
    if (!staffId) throw new Error("STAFF_PROFILE_REQUIRED");
    const current = await client.query(
      `SELECT id, check_in_at, check_out_at
       FROM attendance_records
       WHERE staff_id = $1
         AND created_at::date = ${propertyDayExpression("$2::timestamptz")}
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [staffId, canonicalNow],
    );
    const record = current.rows[0];

    if (action === "check_in") {
      if (record?.check_in_at && !record.check_out_at) throw new Error("ALREADY_CHECKED_IN");
      const inserted = await client.query(
`INSERT INTO attendance_records (user_id, staff_id, check_in_at, status, verification_status, notes)
       VALUES ($1, $2, $3::timestamptz, 'pending_verification', 'pending', $4) RETURNING *`,
      [session.id, staffId, canonicalNow, notes?.slice(0, 500) ?? null],
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO attendance_policy_events (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
         VALUES ($1, $2, 'check_in', $2, $3, $4::jsonb)`,
        [row.id, staffId, `attendance:${row.id}:check_in`, JSON.stringify({ source: "attendance_service", clock: "canonical_property" })],
      );
      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         VALUES ('attendance.checked_in', 'attendance_record', $1, $2, $3::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [row.id, `attendance:${row.id}:checked_in`, JSON.stringify({ attendanceRecordId: row.id, staffId, clock: "canonical_property" })],
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
       LEFT JOIN staff_schedule_assignments a ON a.staff_id = sp.id AND a.work_date = ${propertyDayExpression("$2::timestamptz")} AND a.status <> 'cancelled'
       LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
       WHERE sp.user_id = $1 AND sp.is_active = true
       LIMIT 1`,
      [session.id, canonicalNow],
    );
    const scheduledEnd = schedule.rows[0]?.end_time;
    if (scheduledEnd) {
      const timeCheck = await client.query(
        `SELECT (($1::timestamptz AT TIME ZONE 'Africa/Accra')::time >= $2::time) AS allowed`,
        [canonicalNow, scheduledEnd],
      );
      if (!timeCheck.rows[0]?.allowed) throw new Error("CHECKOUT_TOO_EARLY");
    }

    const updated = await client.query(
      `UPDATE attendance_records
       SET check_out_at = $2::timestamptz, status = 'checked_out', updated_at = $2::timestamptz
       WHERE id = $1 AND check_out_at IS NULL RETURNING *`,
      [record.id, canonicalNow],
    );
    if (!updated.rows[0]) throw new Error("ALREADY_CHECKED_OUT");
    const row = updated.rows[0];
    await client.query(
      `INSERT INTO attendance_policy_events (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
       VALUES ($1, $2, 'check_out', $2, $3, $4::jsonb)`,
      [row.id, staffId, `attendance:${row.id}:check_out`, JSON.stringify({ source: "attendance_service", clock: "canonical_property" })],
    );
    await client.query(
      `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
       VALUES ('attendance.checked_out', 'attendance_record', $1, $2, $3::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [row.id, `attendance:${row.id}:checked_out`, JSON.stringify({ attendanceRecordId: row.id, staffId, clock: "canonical_property" })],
    );
    return { record: row, nextAction: "complete" as const };
  });
}
