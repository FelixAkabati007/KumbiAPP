import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { managementRoles } from "@/lib/roles";
import { ensureAttendanceSchema } from "@/lib/attendance-service";
import {
  getAccraDateKey,
  resolveWorkforceSchedulesForActiveStaff,
} from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

export async function POST() {
  const { error } = await requireRole(...managementRoles);
  if (error) return error;

  try {
    await ensureAttendanceSchema();
    await query(
      `CREATE TABLE IF NOT EXISTS attendance_exceptions (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         attendance_record_id UUID,
         staff_id UUID NOT NULL,
         attendance_date DATE NOT NULL,
         status VARCHAR(50) NOT NULL DEFAULT 'awaiting_reason',
         staff_reply TEXT,
         manager_message TEXT,
         resolved_by UUID,
         resolved_at TIMESTAMP WITH TIME ZONE,
         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
         UNIQUE (staff_id, attendance_date)
       )`,
    ).catch(() => undefined);

    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayAccra = getAccraDateKey(yesterdayDate);
    const activeStaff = await resolveWorkforceSchedulesForActiveStaff(yesterdayDate.toISOString());

    const [recordedRes, leaveRes, permRes] = await Promise.all([
      query(
        `SELECT staff_id::text AS staff_id, user_id::text AS user_id
         FROM attendance_records
         WHERE (timezone('Africa/Accra', COALESCE(check_in_at, created_at)))::date = $1::date`,
        [yesterdayAccra],
      ),
      query(
        `SELECT staff_id::text AS id
         FROM leave_requests
         WHERE status = 'approved'
           AND $1::date BETWEEN start_date AND end_date`,
        [yesterdayAccra],
      ).catch(() => ({ rows: [] as Array<{ id: string }> })),
      query(
        `SELECT staff_id::text AS id
         FROM attendance_permission_requests
         WHERE status = 'approved'
           AND $1::date BETWEEN start_date AND end_date`,
        [yesterdayAccra],
      ).catch(() => ({ rows: [] as Array<{ id: string }> })),
    ]);

    const coveredIds = new Set<string>();
    for (const row of recordedRes.rows) {
      if (row.staff_id) coveredIds.add(String(row.staff_id));
      if (row.user_id) coveredIds.add(String(row.user_id));
    }
    for (const row of leaveRes.rows) {
      if (row.id) coveredIds.add(String(row.id));
    }
    for (const row of permRes.rows) {
      if (row.id) coveredIds.add(String(row.id));
    }

    let created = 0;
    for (const member of activeStaff) {
      const targetStaffId = member.staffId || member.userId;
      if (!targetStaffId) continue;
      if (
        (member.staffId && coveredIds.has(member.staffId)) ||
        (member.userId && coveredIds.has(member.userId))
      ) {
        continue;
      }

      const exceptionStaffId = member.userId || member.staffId;
      const existingEx = await query(
        `SELECT id FROM attendance_exceptions
         WHERE staff_id = $1::uuid AND attendance_date = $2::date
         LIMIT 1`,
        [exceptionStaffId, yesterdayAccra],
      );
      if (existingEx.rows[0]) continue;

      const recRes = await query(
        `INSERT INTO attendance_records (staff_id, user_id, status, verification_status, notes, created_at, updated_at)
         VALUES (
           $1::uuid,
           $2::uuid,
           'absent',
           'absent',
           'Automatically marked absent after 24 hours without check-in.',
           ($3::text || 'T23:59:00Z')::timestamptz,
           now()
         )
         RETURNING id`,
        [targetStaffId, member.userId ?? null, yesterdayAccra],
      );

      const exRes = await query(
        `INSERT INTO attendance_exceptions (attendance_record_id, staff_id, attendance_date, status)
         VALUES ($1::uuid, $2::uuid, $3::date, 'awaiting_reason')
         ON CONFLICT (staff_id, attendance_date) DO NOTHING
         RETURNING id`,
        [recRes.rows[0]?.id ?? null, exceptionStaffId, yesterdayAccra],
      );
      if (exRes.rowCount) {
        created += 1;
      }
    }

    if (created > 0) {
      await query(
        `INSERT INTO notifications (recipient_user_id, title, message, type)
         SELECT u.id, 'Staff absence requires review',
           'A staff member was automatically marked absent after 24 hours without checking in. Review the attendance exception queue.',
           'attendance_absence'
         FROM users u
         WHERE u.role IN ('admin', 'manager', 'operationsManager', 'restaurantManager', 'hotelManager')
           AND u.is_active = true`,
      ).catch(() => undefined);
      const { publishRealtime } = await import("@/lib/realtime");
      await publishRealtime("notifications.updated", "attendance_absence").catch(() => undefined);
    }

    return NextResponse.json({ created, reconciledDate: yesterdayAccra });
  } catch (cause) {
    console.error("[attendance] absence reconciliation failed", cause);
    return NextResponse.json({ error: "Unable to reconcile missed attendance" }, { status: 500 });
  }
}
