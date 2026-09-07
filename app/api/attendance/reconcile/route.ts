import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const { error } = await requireRole("admin", "manager", "operationsManager");
  if (error) return error;

  try {
    const result = await query(`
      WITH missed_shifts AS (
        SELECT ss.id AS shift_id, ss.staff_id, ss.shift_date, sp.department,
               CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name
        FROM staff_shifts ss
        JOIN staff_profiles sp ON sp.user_id = ss.staff_id
        WHERE ss.scheduled_end IS NOT NULL
          AND ss.scheduled_end <= now() - interval '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.staff_id = ss.staff_id
              AND ar.shift_id = ss.id
          )
      ), created_records AS (
        INSERT INTO attendance_records (staff_id, shift_id, status, verification_status, notes)
        SELECT staff_id, shift_id, 'absent', 'absent', 'Automatically marked absent after 24 hours without check-in.'
        FROM missed_shifts
        RETURNING id, staff_id, shift_id
      ), created_exceptions AS (
        INSERT INTO attendance_exceptions (attendance_record_id, staff_id, attendance_date, status)
        SELECT cr.id, cr.staff_id, ms.shift_date, 'awaiting_reason'
        FROM created_records cr JOIN missed_shifts ms ON ms.shift_id = cr.shift_id
        ON CONFLICT (staff_id, attendance_date) DO NOTHING
        RETURNING id, staff_id, attendance_date
      )
      SELECT COUNT(*)::int AS created_count FROM created_exceptions
    `);

    const created = Number(result.rows[0]?.created_count ?? 0);
    if (created > 0) {
      await query(`
        INSERT INTO notifications (recipient_user_id, title, message, type)
        SELECT u.id, 'Staff absence requires review',
          'A staff member was automatically marked absent after 24 hours without checking in. Review the attendance exception queue.',
          'attendance_absence'
        FROM users u
        WHERE u.role IN ('admin', 'manager', 'operationsManager')
          AND u.is_active = true
      `);
    }
    return NextResponse.json({ created });
  } catch (cause) {
    console.error("[attendance] absence reconciliation failed", cause);
    return NextResponse.json({ error: "Unable to reconcile missed attendance" }, { status: 500 });
  }
}
