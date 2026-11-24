import { transaction } from "@/lib/db";
import type { ApiSession } from "@/lib/api-auth";
import { managementRoles } from "@/lib/roles";
import { propertyDayExpression } from "@/lib/operational-day";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { resolveWorkforceSchedule } from "@/lib/workforce-schedule";

export type AttendanceAction = "check_in" | "check_out";

export async function registerAttendance(session: ApiSession, action: AttendanceAction, notes?: string) {
  if (action === "check_in" && managementRoles.includes(session.role)) {
    throw new Error("MANAGERIAL_ROLE_CHECK_IN_FORBIDDEN");
  }
  const canonicalNow = await getCanonicalTransactionTimestamp();
  return transaction(async (client) => {
    let identity = await client.query<{ staff_id: string }>(
      `SELECT id AS staff_id
       FROM staff_profiles
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [session.id],
    );
    let staffId = identity.rows[0]?.staff_id;
    if (!staffId) {
      const prov = await client.query<{ id: string }>(
        `INSERT INTO staff_profiles (user_id, first_name, last_name, business_email, department, position, job_classification, password_hash, is_active)
         SELECT $1, COALESCE(name, 'Staff'), 'Staff', email, 'Operations', $2, $2, 'managed', true
         FROM users WHERE id = $1
         ON CONFLICT (user_id) DO UPDATE SET is_active = true
         RETURNING id`,
        [session.id, session.role],
      ).catch(() => ({ rows: [] }));
      staffId = prov.rows[0]?.id;
    }
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
         SELECT 'attendance.checked_in', 'attendance_record', $1::text, $2::text, $3::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM operational_outbox WHERE idempotency_key = $2::text
         )`,
        [row.id, `attendance:${row.id}:checked_in`, JSON.stringify({ attendanceRecordId: row.id, staffId, clock: "canonical_property" })],
      );
      return { record: row, nextAction: "check_out" as const };
    }

    if (!record?.check_in_at || record.check_out_at) throw new Error("CHECK_IN_REQUIRED");

    // Strictly enforce the rule from Settings -> Staff time schedules
    const schedule = await resolveWorkforceSchedule(session.id, canonicalNow, client.query.bind(client));
    const scheduledEnd = schedule?.endTime;
    if (scheduledEnd) {
      const timeCheck = await client.query(
        `SELECT (($1::timestamptz AT TIME ZONE 'Africa/Accra')::time >= $2::time) AS allowed`,
        [canonicalNow, scheduledEnd],
      );
      if (!timeCheck.rows[0]?.allowed) throw new Error(`CHECKOUT_TOO_EARLY:${scheduledEnd.slice(0, 5)}`);
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
       SELECT 'attendance.checked_out', 'attendance_record', $1::text, $2::text, $3::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM operational_outbox WHERE idempotency_key = $2::text
       )`,
      [row.id, `attendance:${row.id}:checked_out`, JSON.stringify({ attendanceRecordId: row.id, staffId, clock: "canonical_property" })],
    );
    return { record: row, nextAction: "complete" as const };
  });
}
