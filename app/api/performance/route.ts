import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { session, error } = await requireRole("admin", "manager", "finance", "restaurantManager", "hotelManager", "operationsManager");
  if (error) return error;
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || "1970-01-01";
    const to = url.searchParams.get("to") || "2999-12-31";
    const scope = session.role === "manager" || session.role === "admin" ? null : session.role === "restaurantManager" ? "Restaurant" : session.role === "hotelManager" ? "Hotel" : "Operations";
    const scopeClause = scope ? "AND COALESCE(NULLIF(sp.department, ''), 'Operations') = $3" : "";
    const params = scope ? [from, to, scope] : [from, to];
    const [summary, staff, events, eligibleStaff] = await Promise.all([
      query(`SELECT COUNT(DISTINCT pe.staff_id)::int AS staff_count, COALESCE(SUM(pe.points), 0)::numeric AS total_points, COUNT(pe.id)::int AS event_count FROM performance_events pe JOIN staff_profiles sp ON sp.id = pe.staff_id WHERE pe.verification_status = 'verified' AND pe.completed_at::date BETWEEN $1 AND $2 ${scopeClause}`, params),
      query(`SELECT pe.staff_id, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name, COALESCE(sp.department, 'Operations') AS department, COALESCE(SUM(pe.points), 0)::numeric AS points, COUNT(pe.id)::int AS events, MAX(pe.completed_at) AS last_activity FROM performance_events pe JOIN staff_profiles sp ON sp.id = pe.staff_id WHERE pe.verification_status = 'verified' AND pe.completed_at::date BETWEEN $1 AND $2 ${scopeClause} GROUP BY pe.staff_id, sp.first_name, sp.last_name, sp.department ORDER BY points DESC`, params),
      query(`SELECT pe.id, pe.points, pe.source_type, pe.completed_at, pe.metadata, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name, COALESCE(sp.department, 'Operations') AS department FROM performance_events pe JOIN staff_profiles sp ON sp.id = pe.staff_id WHERE pe.verification_status = 'verified' AND pe.completed_at::date BETWEEN $1 AND $2 ${scopeClause} ORDER BY pe.completed_at DESC LIMIT 100`, params),
      query(`SELECT id AS staff_id, CONCAT_WS(' ', first_name, last_name) AS staff_name, COALESCE(department, 'Operations') AS department FROM staff_profiles WHERE is_active = true ${scope ? "AND COALESCE(NULLIF(department, ''), 'Operations') = $1" : ""} ORDER BY first_name, last_name`, scope ? [scope] : []),
    ]);
    return NextResponse.json({ summary: summary.rows[0], staff: staff.rows, eligibleStaff: eligibleStaff.rows, events: events.rows, scope: scope ?? "All departments" });
  } catch (cause) {
    console.error("[performance] load failed", cause);
    return NextResponse.json({ error: "Unable to load staff performance" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireRole("admin", "manager", "restaurantManager", "hotelManager", "operationsManager");
  if (error) return error;
  try {
    const body = await request.json();
    if (body.mode === "sync") {
      const from = typeof body.from === "string" ? body.from : "1970-01-01";
      const to = typeof body.to === "string" ? body.to : "2999-12-31";
      const attendance = await query(`INSERT INTO performance_events (staff_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
        SELECT ar.staff_id, 'attendance_verified', ar.id, 1, COALESCE(ar.verified_at, ar.check_in_at), ar.verified_by, 'verified', '{"category":"Attendance"}'::jsonb
        FROM attendance_records ar WHERE ar.verification_status = 'verified' AND COALESCE(ar.verified_at, ar.check_in_at)::date BETWEEN $1 AND $2
        AND NOT EXISTS (SELECT 1 FROM performance_events pe WHERE pe.source_id = ar.id AND pe.source_type = 'attendance_verified')`, [from, to]);
      const tasks = await query(`INSERT INTO performance_events (staff_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
        SELECT ht.assigned_to, 'housekeeping_task_completed', ht.id, 2, ht.completed_at, $3, 'verified', '{"category":"Task completion"}'::jsonb
        FROM housekeeping_tasks ht WHERE ht.status IN ('completed', 'done') AND ht.assigned_to IS NOT NULL AND ht.completed_at::date BETWEEN $1 AND $2
        AND NOT EXISTS (SELECT 1 FROM performance_events pe WHERE pe.source_id = ht.id AND pe.source_type = 'housekeeping_task_completed')`, [from, to, session.id]);
      return NextResponse.json({ synced: (attendance.rowCount ?? 0) + (tasks.rowCount ?? 0), attendance: attendance.rowCount ?? 0, tasks: tasks.rowCount ?? 0 });
    }
    const points = Number(body.points);
    if (!body.staffId || !Number.isFinite(points) || points === 0 || !String(body.reason || "").trim()) return NextResponse.json({ error: "Staff member, non-zero points, and a reason are required" }, { status: 400 });
    const staff = await query(`SELECT id, department FROM staff_profiles WHERE id = $1 AND is_active = true`, [body.staffId]);
    if (!staff.rowCount) return NextResponse.json({ error: "Active staff member not found" }, { status: 404 });
    const event = await query(`INSERT INTO performance_events (staff_id, source_type, points, completed_at, verified_by, verification_status, metadata) VALUES ($1, 'manager_adjustment', $2, now(), $3, 'verified', $4) RETURNING *`, [body.staffId, points, session.id, JSON.stringify({ reason: String(body.reason).trim(), category: body.category || "Manager recognition" })]);
    return NextResponse.json({ event: event.rows[0] }, { status: 201 });
  } catch (cause) {
    console.error("[performance] award failed", cause);
    return NextResponse.json({ error: "Unable to save performance adjustment" }, { status: 500 });
  }
}
