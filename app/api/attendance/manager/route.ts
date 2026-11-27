import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { propertyDayExpression } from "@/lib/operational-day";
import { managementRoles } from "@/lib/roles";
import { ensureAttendanceSchema } from "@/lib/attendance-service";
import { publishRealtime } from "@/lib/realtime";
import {
  getAccraDateKey,
  resolveWorkforceSchedule,
  resolveWorkforceSchedulesForActiveStaff,
  type WorkforceSchedule,
} from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function computeShiftPeriod(startTime?: string | null): string {
  if (!startTime) return "Unscheduled";
  const hour = Number(String(startTime).split(":")[0]);
  if (!Number.isFinite(hour)) return "Unscheduled";
  if (hour < 10) return "Early";
  if (hour < 14) return "Mid";
  return "Late";
}

function lifecycleFromRecord(row: {
  check_in_at?: string | null;
  check_out_at?: string | null;
  verification_status?: string | null;
  status?: string | null;
}): string {
  if (row.check_out_at || row.status === "checked_out" || row.status === "checked_out_early" || row.status === "auto_checked_out") {
    return "completed";
  }
  const v = row.verification_status;
  if (v === "pending") return "waiting_for_approval";
  if (v === "verified" || v === "approved") return "approved";
  if (v === "late" || v === "approved_late") return "approved_late";
  if (v === "rejected") return "rejected";
  if (row.check_in_at) return "waiting_for_approval";
  return "not_checked_in";
}

interface ManagerRecordQueryRow {
  id: string;
  staff_id: string | null;
  user_id: string | null;
  staff_name: string | null;
  position: string | null;
  job_classification: string | null;
  department: string | null;
  staff_email: string | null;
  staff_role: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_checkout_minutes: number;
  status: string | null;
  verification_status: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string | null;
}

export async function GET() {
  const { error } = await requireRole(...managementRoles);
  if (error) return error;
  try {
    await ensureAttendanceSchema();
    const nowIso = new Date().toISOString();
    const todayAccra = getAccraDateKey(nowIso);

    const [recordsRes, activeSchedules, frequency, excusedLeaveRes, excusedPermRes] = await Promise.all([
      query<ManagerRecordQueryRow>(
        `SELECT
           ar.id,
           ar.staff_id,
           ar.user_id,
           COALESCE(
             NULLIF(NULLIF(TRIM(u.name), ''), 'Staff member'),
             NULLIF(CONCAT_WS(' ', NULLIF(TRIM(sp.first_name), ''), NULLIF(TRIM(sp.last_name), '')), ''),
             NULLIF(TRIM(u.email), ''),
             ar.staff_id::text
           ) AS staff_name,
           sp.position,
           sp.job_classification,
           sp.department,
           u.email AS staff_email,
           COALESCE(u.role::text, 'staff') AS staff_role,
           ar.check_in_at,
           ar.check_out_at,
           COALESCE(ar.late_minutes, 0) AS late_minutes,
           COALESCE(ar.early_checkout_minutes, 0) AS early_checkout_minutes,
           ar.status,
           ar.verification_status,
           ar.verified_at,
           ar.notes,
           ar.created_at
         FROM attendance_records ar
         LEFT JOIN LATERAL (
           SELECT sp_inner.*
           FROM staff_profiles sp_inner
           WHERE sp_inner.id = ar.staff_id
              OR sp_inner.user_id = COALESCE(ar.user_id, ar.staff_id)
           ORDER BY (sp_inner.id = ar.staff_id) DESC, sp_inner.updated_at DESC NULLS LAST
           LIMIT 1
         ) sp ON true
         LEFT JOIN users u ON u.id = COALESCE(ar.user_id, sp.user_id, ar.staff_id)
         WHERE ${propertyDayExpression("COALESCE(ar.check_in_at, ar.created_at)")} = ${propertyDayExpression()}
            OR (
              ar.check_in_at IS NOT NULL
              AND ar.check_out_at IS NULL
              AND ar.check_in_at >= now() - interval '24 hours'
            )
         ORDER BY COALESCE(ar.check_in_at, ar.created_at) DESC
         LIMIT 250`,
      ),
      resolveWorkforceSchedulesForActiveStaff(nowIso).catch(() => []),
      query(
        `SELECT
           staff_id,
           COUNT(*) FILTER (WHERE verification_status IN ('verified', 'approved', 'late', 'approved_late')) AS verified_days,
           COUNT(*) AS recorded_days
         FROM attendance_records
         WHERE created_at >= date_trunc('month', ${propertyDayExpression()})
         GROUP BY staff_id
         ORDER BY verified_days DESC`,
      ),
      query(
        `SELECT staff_id::text AS id
         FROM leave_requests
         WHERE status = 'approved'
           AND $1::date BETWEEN start_date AND end_date`,
        [todayAccra],
      ).catch(() => ({ rows: [] as Array<{ id: string }> })),
      query(
        `SELECT staff_id::text AS id
         FROM attendance_permission_requests
         WHERE status = 'approved'
           AND $1::date BETWEEN start_date AND end_date`,
        [todayAccra],
      ).catch(() => ({ rows: [] as Array<{ id: string }> })),
    ]);

    const scheduleByIdentity = new Map<string, WorkforceSchedule>();
    for (const entry of activeSchedules) {
      if (entry.staffId) scheduleByIdentity.set(entry.staffId, entry.schedule);
      if (entry.userId) scheduleByIdentity.set(entry.userId, entry.schedule);
    }

    const enrichedRecords = await Promise.all(
      recordsRes.rows.map(async (row) => {
        let schedule =
          (row.staff_id ? scheduleByIdentity.get(String(row.staff_id)) : undefined) ??
          (row.user_id ? scheduleByIdentity.get(String(row.user_id)) : undefined);

        if (!schedule) {
          const targetId = String(row.user_id || row.staff_id || "");
          if (targetId) {
            schedule = await resolveWorkforceSchedule(
              targetId,
              nowIso,
              undefined,
              row.staff_role ? String(row.staff_role) : undefined,
              row.department ? String(row.department) : undefined,
            ).catch(() => undefined);
          }
        }

        const scheduledStart = schedule?.start_time ?? null;
        const scheduledEnd = schedule?.end_time ?? null;
        const shiftPeriod =
          schedule?.source && schedule.source !== "fallback"
            ? computeShiftPeriod(scheduledStart)
            : scheduledStart
            ? computeShiftPeriod(scheduledStart)
            : "Unscheduled";

        return {
          ...row,
          schedule_name: schedule?.schedule_name ?? null,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          shift_period: shiftPeriod,
          lifecycleStatus: lifecycleFromRecord(row),
        };
      }),
    );

    const pending = enrichedRecords
      .filter((row) => row.verification_status === "pending")
      .sort((a, b) => {
        const ta = a.check_in_at ? new Date(a.check_in_at).getTime() : 0;
        const tb = b.check_in_at ? new Date(b.check_in_at).getTime() : 0;
        return ta - tb;
      });

    const presentIdentities = new Set<string>();
    let presentCount = 0;
    let checkedOutCount = 0;
    let explicitAbsentCount = 0;

    for (const row of enrichedRecords) {
      if (row.check_in_at && row.verification_status !== "rejected") {
        presentCount += 1;
        if (row.staff_id) presentIdentities.add(String(row.staff_id));
        if (row.user_id) presentIdentities.add(String(row.user_id));
        if (row.check_out_at) {
          checkedOutCount += 1;
        }
      } else if (!row.check_in_at && (row.verification_status === "absent" || row.status === "absent")) {
        explicitAbsentCount += 1;
        if (row.staff_id) presentIdentities.add(String(row.staff_id));
        if (row.user_id) presentIdentities.add(String(row.user_id));
      }
    }

    const excusedIds = new Set<string>();
    for (const r of excusedLeaveRes.rows) {
      if (r.id) excusedIds.add(String(r.id));
    }
    for (const r of excusedPermRes.rows) {
      if (r.id) excusedIds.add(String(r.id));
    }

    let unrecordedScheduledCount = 0;
    for (const staff of activeSchedules) {
      const checkedInOrRecorded =
        (staff.staffId && presentIdentities.has(staff.staffId)) ||
        (staff.userId && presentIdentities.has(staff.userId));
      const excused =
        (staff.staffId && excusedIds.has(staff.staffId)) ||
        (staff.userId && excusedIds.has(staff.userId));
      if (!checkedInOrRecorded && !excused) {
        unrecordedScheduledCount += 1;
      }
    }

    const absentTotal = Math.max(explicitAbsentCount, explicitAbsentCount + unrecordedScheduledCount);

    return NextResponse.json({
      pending,
      todayRecords: enrichedRecords,
      summary: {
        present: String(presentCount),
        pending: String(pending.length),
        absent: String(absentTotal),
        checkedOut: String(checkedOutCount),
      },
      frequency: frequency.rows,
    });
  } catch (cause) {
    console.error("[attendance] manager load failed", cause);
    return NextResponse.json({ error: "Unable to load attendance" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { session, error } = await requireRole(...managementRoles);
  if (error) return error;
  try {
    await ensureAttendanceSchema();
    const body = await request.json();
    if (!body.id || !["verified", "rejected", "late"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid attendance decision" }, { status: 400 });
    }
    const verifiedBy = UUID_REGEX.test(String(session.id ?? "")) ? session.id : null;
    const result = await query(
      `UPDATE attendance_records
       SET verification_status = $2::varchar,
           status = CASE
             WHEN check_out_at IS NOT NULL OR status IN ('checked_out', 'checked_out_early', 'auto_checked_out', 'manager_corrected')
               THEN status
             ELSE $2::varchar
           END,
           verified_by = $3::uuid,
           verified_at = now(),
           updated_at = now()
       WHERE id = $1::uuid
         AND verification_status = 'pending'
       RETURNING *`,
      [body.id, body.status, verifiedBy],
    );
    if (!result.rowCount) {
      return NextResponse.json({ error: "Attendance record is already resolved" }, { status: 409 });
    }
    const updatedRow = result.rows[0];
    if (body.status === "verified" || body.status === "late") {
      const awardedPoints = body.status === "late" ? 0.5 : 1;
      const reasonText =
        body.status === "late"
          ? "Verified shift attendance (late arrival)"
          : "Verified on-time shift attendance";
      await query(
        `INSERT INTO performance_events (staff_id, source_type, source_id, points, completed_at, verification_status, verified_by, metadata)
         SELECT $1::uuid, 'attendance_verified', $2, $6::numeric, now(), 'verified', $3::uuid, $4::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM performance_events
           WHERE source_id::text = $5::text
             AND source_type = 'attendance_verified'
         )`,
        [
          updatedRow.staff_id,
          body.id,
          verifiedBy,
          JSON.stringify({ source: "attendance_approval", category: "Attendance", reason: reasonText }),
          String(body.id),
          awardedPoints,
        ],
      ).catch((err) => console.warn("[attendance] performance_events insert skipped:", err));
    }
    await query(
      `INSERT INTO notifications (recipient_user_id, title, message, type)
       VALUES (
         COALESCE(
           (SELECT COALESCE(user_id, $1) FROM staff_profiles WHERE id = $1::uuid OR user_id = $1::uuid LIMIT 1),
           $1::uuid
         ),
         $2,
         $3,
         'attendance_decision'
       )`,
      [
        updatedRow.staff_id,
        `Attendance ${body.status}`,
        `Your attendance check-in was ${body.status} by ${session.email}.`,
      ],
    ).catch((err) => console.warn("[attendance] notification insert skipped:", err));

    await Promise.all([
      publishRealtime("attendance.updated", String(updatedRow.id)),
      publishRealtime("notifications.updated", String(updatedRow.id)),
    ]).catch(() => undefined);
    return NextResponse.json({ record: updatedRow });
  } catch (cause) {
    console.error("[attendance] manager decision failed", cause);
    return NextResponse.json({ error: "Unable to save attendance decision" }, { status: 500 });
  }
}
