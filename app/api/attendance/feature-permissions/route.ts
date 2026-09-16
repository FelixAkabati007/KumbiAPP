import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const managerRoles = ["admin", "manager", "operationsManager"];
const permissionFields = ["leave_requests_enabled", "planned_absence_enabled", "attendance_exceptions_enabled"] as const;
type PermissionField = (typeof permissionFields)[number];

function isManager(role?: string) { return Boolean(role && managerRoles.includes(role)); }

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(session.role) && session.role !== "staff") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");
  const department = searchParams.get("department");

  if (session.role === "staff") {
    const existing = await query(`SELECT * FROM attendance_feature_permissions WHERE staff_id = $1`, [session.id]);
    if (existing.rowCount) return NextResponse.json({ permissions: existing.rows[0] });
    const inserted = await query(`INSERT INTO attendance_feature_permissions (staff_id) VALUES ($1) RETURNING *`, [session.id]);
    return NextResponse.json({ permissions: inserted.rows[0] });
  }

  if (!staffId) {
    const params: string[] = [];
    const departmentClause = department && department !== "all" ? `AND sp.job_classification = $1` : "";
    if (departmentClause && department) params.push(department);
    const result = await query(
      `SELECT u.id AS staff_id, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name, sp.job_classification AS department,
              COALESCE(afp.leave_requests_enabled, true) AS leave_requests_enabled,
              COALESCE(afp.planned_absence_enabled, true) AS planned_absence_enabled,
              COALESCE(afp.attendance_exceptions_enabled, true) AS attendance_exceptions_enabled
       FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id LEFT JOIN attendance_feature_permissions afp ON afp.staff_id = u.id
       WHERE u.role = 'staff' AND u.is_active = true ${departmentClause} ORDER BY staff_name`, params);
    return NextResponse.json({ permissions: result.rows });
  }

  const result = await query(`SELECT * FROM attendance_feature_permissions WHERE staff_id = $1`, [staffId]);
  if (result.rowCount) return NextResponse.json({ permissions: result.rows[0] });
  const inserted = await query(`INSERT INTO attendance_feature_permissions (staff_id) VALUES ($1) RETURNING *`, [staffId]);
  return NextResponse.json({ permissions: inserted.rows[0] });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as {
    staffId?: string; staffIds?: string[]; department?: string; applyToDepartment?: boolean;
    leaveRequestsEnabled?: boolean; plannedAbsenceEnabled?: boolean; attendanceExceptionsEnabled?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const values: Partial<Record<PermissionField, boolean>> = {
    leave_requests_enabled: body.leaveRequestsEnabled,
    planned_absence_enabled: body.plannedAbsenceEnabled,
    attendance_exceptions_enabled: body.attendanceExceptionsEnabled,
  };
  const updates = Object.entries(values).filter((entry): entry is [PermissionField, boolean] => typeof entry[1] === "boolean");
  if (!updates.length) return NextResponse.json({ error: "No permissions to update" }, { status: 400 });
  const requestedIds = Array.from(new Set([...(body.staffIds ?? []), ...(body.staffId ? [body.staffId] : [])].filter(Boolean)));
  const useDepartment = body.applyToDepartment === true && Boolean(body.department && body.department !== "all");
  if (!requestedIds.length && !useDepartment) return NextResponse.json({ error: "Select accounts or a department" }, { status: 400 });

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const target = useDepartment
      ? await client.query<{ id: string }>(`SELECT u.id FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id WHERE u.role = 'staff' AND u.is_active = true AND sp.job_classification = $1`, [body.department])
      : await client.query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'staff' AND is_active = true`, [requestedIds]);
    if (!target.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "No active staff accounts matched the selection" }, { status: 404 }); }
    for (const row of target.rows) {
      const params = [row.id, ...updates.map(([, value]) => value), session.id];
      const setClause = updates.map(([field], index) => `${field} = $${index + 2}`).join(", ");
      const updated = await client.query(`UPDATE attendance_feature_permissions SET ${setClause}, updated_by = $${updates.length + 2}, updated_at = now() WHERE staff_id = $1 RETURNING *`, params);
      if (!updated.rowCount) {
        const flags = permissionFields.map((field) => values[field] ?? true);
        await client.query(`INSERT INTO attendance_feature_permissions (staff_id, leave_requests_enabled, planned_absence_enabled, attendance_exceptions_enabled, updated_by) VALUES ($1, $2, $3, $4, $5)`, [row.id, ...flags, session.id]);
      }
    }
    await client.query("COMMIT");
    const ids = target.rows.map((row) => row.id);
    const refreshed = await query(`SELECT u.id AS staff_id, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name, sp.job_classification AS department, COALESCE(afp.leave_requests_enabled, true) AS leave_requests_enabled, COALESCE(afp.planned_absence_enabled, true) AS planned_absence_enabled, COALESCE(afp.attendance_exceptions_enabled, true) AS attendance_exceptions_enabled FROM users u LEFT JOIN staff_profiles sp ON sp.user_id = u.id LEFT JOIN attendance_feature_permissions afp ON afp.staff_id = u.id WHERE u.id = ANY($1::uuid[]) ORDER BY staff_name`, [ids]);
    return NextResponse.json({ permissions: refreshed.rows, updatedCount: refreshed.rowCount });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[v0] Bulk permission update failed:", error);
    return NextResponse.json({ error: "Unable to update permissions" }, { status: 500 });
  } finally { client.release(); }
}
