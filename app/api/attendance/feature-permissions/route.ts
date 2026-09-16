import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const managerRoles = ["admin", "manager", "operationsManager"];

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!managerRoles.includes(session.role) && session.role !== "staff") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");

  if (session.role === "staff") {
    const result = await query(`SELECT * FROM attendance_feature_permissions WHERE staff_id = $1`, [session.id]);
    if (result.rowCount) return NextResponse.json({ permissions: result.rows[0] });
    const inserted = await query(`INSERT INTO attendance_feature_permissions (staff_id) VALUES ($1) RETURNING *`, [session.id]);
    return NextResponse.json({ permissions: inserted.rows[0] });
  }

  if (!staffId) {
    const result = await query(
      `SELECT u.id AS staff_id, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name, sp.job_classification,
              COALESCE(afp.leave_requests_enabled, true) AS leave_requests_enabled,
              COALESCE(afp.planned_absence_enabled, true) AS planned_absence_enabled,
              COALESCE(afp.attendance_exceptions_enabled, true) AS attendance_exceptions_enabled
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN attendance_feature_permissions afp ON afp.staff_id = u.id
       WHERE u.role = 'staff' AND u.is_active = true
       ORDER BY staff_name`,
      []
    );
    return NextResponse.json({ permissions: result.rows });
  }

  const result = await query(
    `SELECT * FROM attendance_feature_permissions WHERE staff_id = $1`,
    [staffId]
  );

  if (result.rowCount === 0) {
    const defaultResult = await query(
      `INSERT INTO attendance_feature_permissions (staff_id, leave_requests_enabled, planned_absence_enabled, attendance_exceptions_enabled)
       VALUES ($1, true, true, true) RETURNING *`,
      [staffId]
    );
    return NextResponse.json({ permissions: defaultResult.rows[0] });
  }

  return NextResponse.json({ permissions: result.rows[0] });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!managerRoles.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    staffId?: string;
    leaveRequestsEnabled?: boolean;
    plannedAbsenceEnabled?: boolean;
    attendanceExceptionsEnabled?: boolean;
  } | null;

  if (!body?.staffId) return NextResponse.json({ error: "Staff ID is required" }, { status: 400 });

  const updates: string[] = [];
  const params: (string | boolean | null)[] = [body.staffId];
  let paramCount = 2;

  if (body.leaveRequestsEnabled !== undefined) {
    updates.push(`leave_requests_enabled = $${paramCount}`);
    params.push(body.leaveRequestsEnabled);
    paramCount++;
  }

  if (body.plannedAbsenceEnabled !== undefined) {
    updates.push(`planned_absence_enabled = $${paramCount}`);
    params.push(body.plannedAbsenceEnabled);
    paramCount++;
  }

  if (body.attendanceExceptionsEnabled !== undefined) {
    updates.push(`attendance_exceptions_enabled = $${paramCount}`);
    params.push(body.attendanceExceptionsEnabled);
    paramCount++;
  }

  if (!updates.length) return NextResponse.json({ error: "No permissions to update" }, { status: 400 });

  updates.push("updated_by = $" + paramCount);
  updates.push("updated_at = now()");
  params.push(session.id);

  const result = await query(
    `UPDATE attendance_feature_permissions SET ${updates.join(", ")} WHERE staff_id = $1 RETURNING *`,
    params
  );

  if (result.rowCount === 0) {
    const insertResult = await query(
      `INSERT INTO attendance_feature_permissions (staff_id, leave_requests_enabled, planned_absence_enabled, attendance_exceptions_enabled, updated_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        body.staffId,
        body.leaveRequestsEnabled ?? true,
        body.plannedAbsenceEnabled ?? true,
        body.attendanceExceptionsEnabled ?? true,
        session.id,
      ]
    );
    return NextResponse.json({ permissions: insertResult.rows[0] });
  }

  return NextResponse.json({ permissions: result.rows[0] });
}
