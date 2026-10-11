import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Versioned attendance reconciliation endpoint.
 * The legacy endpoint remains available for existing schedulers and clients.
 */
export async function POST() {
  const { error } = await requireRole("admin", "manager", "operationsManager");
  if (error) return error;

  try {
    const result = await query(`
      WITH missed_shifts AS (
        SELECT ss.id AS shift_id, ss.staff_id, ss.shift_date
        FROM staff_shifts ss
        WHERE ss.scheduled_end IS NOT NULL
          AND ss.scheduled_end <= now() - interval '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.staff_id = ss.staff_id AND ar.shift_id = ss.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM attendance_permission_requests apr
            WHERE apr.staff_id = ss.staff_id
              AND apr.status = 'approved'
              AND ss.shift_date BETWEEN apr.start_date AND apr.end_date
          )
      ), created_records AS (
        INSERT INTO attendance_records (staff_id, shift_id, status, verification_status, notes)
        SELECT staff_id, shift_id, 'absent', 'absent',
          'Automatically marked absent after 24 hours without check-in.'
        FROM missed_shifts
        RETURNING id, staff_id, shift_id
      ), created_exceptions AS (
        INSERT INTO attendance_exceptions (attendance_record_id, staff_id, attendance_date, status)
        SELECT cr.id, cr.staff_id, ms.shift_date, 'awaiting_reason'
        FROM created_records cr
        JOIN missed_shifts ms ON ms.shift_id = cr.shift_id
        ON CONFLICT (staff_id, attendance_date) DO NOTHING
        RETURNING id
      )
      SELECT COUNT(*)::int AS created_count FROM created_exceptions
    `);

    const created = Number(result.rows[0]?.created_count ?? 0);
    return NextResponse.json({ apiVersion: "2", created, lifecycle: "absence_review" });
  } catch (cause) {
    console.error("[attendance-v2] reconciliation failed", cause);
    return NextResponse.json({ error: "Unable to reconcile missed attendance", apiVersion: "2" }, { status: 500 });
  }
}

export function OPTIONS() {
  return NextResponse.json({ apiVersion: "2", status: "ok" });
}
