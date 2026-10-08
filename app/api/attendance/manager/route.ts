import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireRole("admin", "manager", "operationsManager");
  if (error) return error;
  try {
    const [pending, summary, frequency] = await Promise.all([
      query(`SELECT ar.id, ar.staff_id, COALESCE(NULLIF(NULLIF(TRIM(u.name), ''), 'Staff member'), NULLIF(CONCAT_WS(' ', NULLIF(TRIM(sp.first_name), ''), NULLIF(TRIM(sp.last_name), '')), ''), NULLIF(TRIM(u.email), ''), ar.staff_id::text) AS staff_name, sp.position, sp.job_classification, sp.department, u.email AS staff_email, COALESCE(u.role::text, 'staff') AS staff_role, ar.check_in_at, ar.check_out_at, ar.status, ar.verification_status, ar.created_at, CASE WHEN ss.scheduled_start IS NULL THEN 'Unscheduled' WHEN EXTRACT(HOUR FROM ss.scheduled_start AT TIME ZONE 'Africa/Accra') < 10 THEN 'Early' WHEN EXTRACT(HOUR FROM ss.scheduled_start AT TIME ZONE 'Africa/Accra') < 14 THEN 'Mid' ELSE 'Late' END AS shift_period FROM attendance_records ar LEFT JOIN staff_profiles sp ON sp.id = ar.staff_id OR sp.user_id = ar.staff_id LEFT JOIN users u ON u.id = sp.user_id OR u.id = ar.staff_id LEFT JOIN staff_shifts ss ON ss.id = ar.shift_id WHERE ar.verification_status = 'pending' ORDER BY ar.check_in_at ASC LIMIT 100`),
      query(`SELECT COUNT(*) FILTER (WHERE check_in_at IS NOT NULL) AS present, COUNT(*) FILTER (WHERE verification_status = 'pending') AS pending, COUNT(*) FILTER (WHERE check_in_at IS NULL) AS absent FROM attendance_records WHERE created_at::date = CURRENT_DATE`),
      query(`SELECT staff_id, COUNT(*) FILTER (WHERE verification_status = 'verified') AS verified_days, COUNT(*) AS recorded_days FROM attendance_records WHERE created_at >= date_trunc('month', CURRENT_DATE) GROUP BY staff_id ORDER BY verified_days DESC`),
    ]);
    return NextResponse.json({ pending: pending.rows, summary: summary.rows[0], frequency: frequency.rows });
  } catch (cause) {
    console.error("[attendance] manager load failed", cause);
    return NextResponse.json({ error: "Unable to load attendance" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { session, error } = await requireRole("admin", "manager", "operationsManager");
  if (error) return error;
  try {
    const body = await request.json();
    if (!body.id || !["verified", "rejected", "late"].includes(body.status)) return NextResponse.json({ error: "Invalid attendance decision" }, { status: 400 });
    const result = await query(
      `UPDATE attendance_records SET verification_status = $2, status = $2, verified_by = $3, verified_at = now(), updated_at = now() WHERE id = $1 AND verification_status = 'pending' RETURNING *`,
      [body.id, body.status, session.id]
    );
    if (!result.rowCount) return NextResponse.json({ error: "Attendance record is already resolved" }, { status: 409 });
    if (body.status === "verified") await query(`INSERT INTO performance_events (staff_id, source_type, source_id, points, verification_status, verified_by, metadata)
      SELECT $1, 'attendance_verified', $2, 1, 'verified', $3, $4::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM performance_events WHERE source_id = $2 AND source_type = 'attendance_verified')`, [result.rows[0].staff_id, body.id, session.id, JSON.stringify({ source: "attendance_approval" })]);
    await query(
      `INSERT INTO notifications (recipient_user_id, title, message, type)
       VALUES ((SELECT COALESCE(user_id, $1) FROM staff_profiles WHERE id = $1 OR user_id = $1 LIMIT 1), $2, $3, 'attendance_decision')`,
      [result.rows[0].staff_id, `Attendance ${body.status}`, `Your attendance check-in was ${body.status} by ${session.email}.`,],
    );
    return NextResponse.json({ record: result.rows[0] });
  } catch (cause) {
    console.error("[attendance] manager decision failed", cause);
    return NextResponse.json({ error: "Unable to save attendance decision" }, { status: 500 });
  }
}
