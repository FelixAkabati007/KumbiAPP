import { transaction } from "@/lib/db";
import type { ApiSession } from "@/lib/api-auth";
import { resolveAttendanceIdentity } from "@/lib/attendance-identity";
import { propertyDayExpression } from "@/lib/operational-day";

export async function registerAttendance(session: ApiSession, notes?: string) {
  const identity = await resolveAttendanceIdentity(session);
  if (!identity.canCheckIn) throw new Error("ATTENDANCE_NOT_APPLICABLE");
  return transaction(async (client) => {
    const current = await client.query(
      `SELECT id, check_in_at, check_out_at
       FROM attendance_records
       WHERE staff_id = $1 AND created_at::date = ${propertyDayExpression()}
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
[identity.userId],
      );
      const record = current.rows[0];

    {
      if (record?.check_in_at && !record.check_out_at) throw new Error("ALREADY_CHECKED_IN");
      const schedule = await client.query(
        `SELECT s.start_time, s.end_time, COALESCE(s.reminder_minutes, 20) AS reminder_minutes
         FROM staff_profiles sp
         LEFT JOIN staff_schedule_assignments a ON a.staff_id = sp.id AND a.work_date = ${propertyDayExpression()} AND a.status <> 'cancelled'
         LEFT JOIN work_schedules s ON s.id = a.schedule_id AND s.is_active = true
         WHERE sp.user_id = $1 OR sp.id = $1
         ORDER BY CASE WHEN sp.user_id = $1 THEN 0 ELSE 1 END
         LIMIT 1`,
        [identity.userId],
      );
      const scheduledStart = schedule.rows[0]?.start_time;
      const scheduledEnd = schedule.rows[0]?.end_time;
      const reminderMinutes = Number(schedule.rows[0]?.reminder_minutes ?? 20);
      // Check-in is always available for standard staff. Schedule data is used
      // for reminders and automated checkout, never to block a late arrival.
      void scheduledStart;
      void scheduledEnd;
      const inserted = await client.query(
        `INSERT INTO attendance_records (staff_id, account_name, check_in_at, status, verification_status, notes)
         VALUES ($1,
           COALESCE(
             (SELECT NULLIF(NULLIF(TRIM(name), ''), 'Staff member') FROM users WHERE id = $1),
             (SELECT NULLIF(CONCAT_WS(' ', NULLIF(TRIM(first_name), ''), NULLIF(TRIM(last_name), '')),
               '') FROM staff_profiles WHERE user_id = $1 OR id = $1 LIMIT 1),
             (SELECT NULLIF(TRIM(email), '') FROM users WHERE id = $1),
             $1::text
           ),
           now(), 'pending_verification', 'pending', $2) RETURNING *`,
        [identity.userId, notes?.slice(0, 500) ?? null],
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO attendance_policy_events (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
         VALUES ($1, $2, 'check_in', $2, $3, $4::jsonb)`,
        [row.id, identity.userId, `attendance:${row.id}:check_in`, JSON.stringify({ source: "attendance_service", userId: identity.userId, staffProfileId: identity.staffProfileId })],
      );
      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         VALUES ('attendance.checked_in', 'attendance_record', $1, $2, $3::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [row.id, `attendance:${row.id}:checked_in`, JSON.stringify({ attendanceRecordId: row.id, staffId: identity.userId, staffProfileId: identity.staffProfileId, reminderMinutes })],
      );
      return {
        record: row,
        nextAction: "waiting" as const,
        schedule: { startTime: scheduledStart ?? null, endTime: scheduledEnd ?? null, reminderMinutes, assigned: Boolean(scheduledStart || scheduledEnd) },
        checkout: { mode: "automatic" as const },
      };
    }
  });
}
