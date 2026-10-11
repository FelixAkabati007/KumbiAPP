import type { ApiSession } from "@/lib/api-auth";
import { transaction } from "@/lib/db";
import { resolveAttendanceIdentity } from "@/lib/attendance-identity";
import { propertyDayExpression } from "@/lib/operational-day";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";

export async function registerAttendance(session: ApiSession, notes?: string) {
  const identity = await resolveAttendanceIdentity(session);
  if (!identity.canCheckIn) throw new Error(identity.eligibilityReason === "MISSING_CLASSIFICATION" ? "ATTENDANCE_PROFILE_INCOMPLETE" : "ATTENDANCE_NOT_APPLICABLE");
  const canonicalNow = await getCanonicalTransactionTimestamp();

  return transaction(async (client) => {
    const current = await client.query(
      `SELECT id, check_in_at, check_out_at
       FROM attendance_records
       WHERE staff_id = $1 AND ${propertyDayExpression("created_at")} = ${propertyDayExpression()}
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [identity.userId],
    );
    const existing = current.rows[0];
    if (existing?.check_in_at && !existing.check_out_at) throw new Error("ALREADY_CHECKED_IN");
    if (existing?.check_out_at) throw new Error("ALREADY_CHECKED_OUT");

    const shift = await client.query(
      `SELECT ss.id AS shift_id, ss.scheduled_start, ss.scheduled_end,
              20 AS reminder_minutes
       FROM staff_shifts ss
       WHERE ss.staff_id = ANY($1::uuid[])
         AND ss.shift_date = ${propertyDayExpression()}::date
         AND ss.status <> 'cancelled'
       ORDER BY ss.scheduled_start NULLS LAST
       LIMIT 1`,
      [[identity.userId, identity.staffProfileId].filter(Boolean)],
    );
    const scheduled = shift.rows[0] ?? null;
    const lateMinutes = scheduled?.scheduled_start
      ? Math.max(0, Math.floor((new Date(canonicalNow).getTime() - new Date(scheduled.scheduled_start).getTime()) / 60000))
      : 0;
    const status = lateMinutes > 0 ? "late" : "pending_verification";

    const inserted = await client.query(
      `INSERT INTO attendance_records
         (staff_id, shift_id, account_name, check_in_at, status, verification_status, late_minutes, notes)
       VALUES ($1, $2, $3, $4::timestamptz, $5, 'pending', $6, $7)
       RETURNING *`,
      [identity.userId, scheduled?.shift_id ?? null, identity.displayName, canonicalNow, status, lateMinutes, notes?.trim().slice(0, 500) || null],
    );
    const row = inserted.rows[0];
    const eventKey = `attendance:${row.id}:check_in`;
    await client.query(
      `INSERT INTO attendance_policy_events
         (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
       VALUES ($1, $2, 'check_in', $2, $3, $4::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [row.id, identity.userId, eventKey, JSON.stringify({ source: "attendance_service", scheduled: Boolean(scheduled), lateMinutes })],
    );
    await client.query(
      `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
       VALUES ('attendance.checked_in', 'attendance_record', $1, $2, $3::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [row.id, `attendance:${row.id}:checked_in`, JSON.stringify({ attendanceRecordId: row.id, staffId: identity.userId, shiftId: scheduled?.shift_id ?? null })],
    );
    return {
      record: row,
      nextAction: "waiting" as const,
      schedule: { startTime: scheduled?.scheduled_start ?? null, endTime: scheduled?.scheduled_end ?? null, reminderMinutes: Number(scheduled?.reminder_minutes ?? 20), assigned: Boolean(scheduled) },
      checkout: { mode: "automatic" as const },
    };
  });
}
