import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { managementRoles, type UserRole } from "@/lib/roles";

const permissionFields = ["leave_requests_enabled", "planned_absence_enabled", "attendance_exceptions_enabled"] as const;
type PermissionField = (typeof permissionFields)[number];

function isManager(role?: string): boolean {
  return Boolean(role && managementRoles.includes(role as UserRole));
}

function normalizeDepartment(rawDept?: string | null, role?: string | null): string {
  const normDept = (rawDept || "").trim().toLowerCase();
  if (normDept.includes("hotel") && normDept.includes("restaurant")) return "Hotel & Restaurant";
  if (normDept.includes("hotel") && normDept.includes("operation")) return "Hotel Operations";
  if (normDept.includes("hotel")) return "Hotel";
  if (normDept.includes("restaurant") || normDept.includes("kitchen") || normDept.includes("bar") || normDept.includes("dining")) return "Restaurant";
  if (normDept.includes("operation") || normDept.includes("security") || normDept.includes("maintenance")) return "Operations";

  const normRole = (role || "").toLowerCase();
  if (normRole === "frontdesk" || normRole === "housekeeping" || normRole === "hotelmanager") return "Hotel";
  if (normRole === "kitchen" || normRole === "restaurantfrontdesk" || normRole === "waiterwaitress" || normRole === "restaurantmanager") return "Restaurant";
  if (normRole === "operationsmanager") return "Operations";

  return rawDept?.trim() || "Restaurant";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");
  const department = searchParams.get("department");

  // Non-managerial operational workforce members query their own personal feature permissions
  if (!isManager(session.role)) {
    const existing = await query(`SELECT * FROM attendance_feature_permissions WHERE staff_id = $1`, [session.id]);
    if (existing.rowCount) {
      return NextResponse.json({ permissions: existing.rows[0], permission: existing.rows[0] });
    }
    const inserted = await query(
      `INSERT INTO attendance_feature_permissions (staff_id, leave_requests_enabled, planned_absence_enabled, attendance_exceptions_enabled)
       VALUES ($1, true, true, true)
       ON CONFLICT (staff_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [session.id],
    );
    return NextResponse.json({ permissions: inserted.rows[0], permission: inserted.rows[0] });
  }

  // Managers querying a specific staff member
  if (staffId) {
    const result = await query(`SELECT * FROM attendance_feature_permissions WHERE staff_id = $1`, [staffId]);
    if (result.rowCount) {
      return NextResponse.json({ permissions: result.rows[0], permission: result.rows[0] });
    }
    const inserted = await query(
      `INSERT INTO attendance_feature_permissions (staff_id, leave_requests_enabled, planned_absence_enabled, attendance_exceptions_enabled)
       VALUES ($1, true, true, true)
       ON CONFLICT (staff_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [staffId],
    );
    return NextResponse.json({ permissions: inserted.rows[0], permission: inserted.rows[0] });
  }

  // Managers querying full staff permissions list with department and classification sync
  const result = await query(
    `SELECT u.id AS staff_id,
            COALESCE(NULLIF(TRIM(u.name), ''), CONCAT_WS(' ', NULLIF(TRIM(sp.first_name), ''), NULLIF(TRIM(sp.last_name), '')), u.email, 'Staff member') AS staff_name,
            COALESCE(
              NULLIF(TRIM(sp.department), ''),
              CASE
                WHEN u.role IN ('frontDesk', 'housekeeping', 'hotelManager') THEN 'Hotel'
                WHEN u.role IN ('kitchen', 'restaurantFrontDesk', 'waiterWaitress', 'restaurantManager') THEN 'Restaurant'
                WHEN u.role IN ('operationsManager') THEN 'Operations'
                ELSE 'Restaurant'
              END
            ) AS department,
            COALESCE(
              NULLIF(TRIM(sp.job_classification), ''),
              NULLIF(TRIM(sp.position), ''),
              CASE
                WHEN u.role = 'kitchen' THEN 'Chef'
                WHEN u.role = 'frontDesk' THEN 'Reception'
                WHEN u.role = 'restaurantFrontDesk' THEN 'Restaurant Front Desk / POS'
                WHEN u.role = 'waiterWaitress' THEN 'Waiter/Waitress'
                WHEN u.role = 'housekeeping' THEN 'Housekeeping'
                WHEN u.role = 'hotelManager' THEN 'Hotel Manager'
                WHEN u.role = 'restaurantManager' THEN 'Restaurant Manager'
                WHEN u.role = 'operationsManager' THEN 'Operations Manager'
                WHEN u.role = 'finance' THEN 'Finance'
                ELSE 'Staff'
              END
            ) AS job_classification,
            COALESCE(NULLIF(TRIM(sp.position), ''), u.role::text) AS position,
            u.role::text AS role,
            COALESCE(afp.leave_requests_enabled, true) AS leave_requests_enabled,
            COALESCE(afp.planned_absence_enabled, true) AS planned_absence_enabled,
            COALESCE(afp.attendance_exceptions_enabled, true) AS attendance_exceptions_enabled
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN attendance_feature_permissions afp ON afp.staff_id = u.id
     WHERE u.is_active = true
       AND u.role NOT IN ('admin')
     ORDER BY staff_name`,
  );

  let filtered = result.rows;
  if (department && department !== "all") {
    const norm = department.toLowerCase();
    if (norm === "hotel_restaurant") {
      filtered = filtered.filter((r) => {
        const d = (r.department || "").toLowerCase();
        return d.includes("hotel") || d.includes("restaurant");
      });
    } else if (norm === "hotel_operations") {
      filtered = filtered.filter((r) => {
        const d = (r.department || "").toLowerCase();
        return d.includes("hotel") || d.includes("operation");
      });
    } else if (norm === "hotel") {
      filtered = filtered.filter((r) => (r.department || "").toLowerCase().includes("hotel"));
    } else if (norm === "restaurant") {
      filtered = filtered.filter((r) => (r.department || "").toLowerCase().includes("restaurant"));
    } else if (norm === "operations") {
      filtered = filtered.filter((r) => (r.department || "").toLowerCase().includes("operation"));
    } else if (norm === "unassigned") {
      filtered = filtered.filter((r) => !r.department || r.department === "unassigned");
    } else {
      filtered = filtered.filter((r) => (r.department || "").toLowerCase() === norm);
    }
  }

  return NextResponse.json({ permissions: filtered });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    staffId?: string;
    staffIds?: string[];
    department?: string;
    applyToDepartment?: boolean;
    leaveRequestsEnabled?: boolean;
    plannedAbsenceEnabled?: boolean;
    attendanceExceptionsEnabled?: boolean;
  } | null;

  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const values: Partial<Record<PermissionField, boolean>> = {
    leave_requests_enabled: body.leaveRequestsEnabled,
    planned_absence_enabled: body.plannedAbsenceEnabled,
    attendance_exceptions_enabled: body.attendanceExceptionsEnabled,
  };

  const updates = Object.entries(values).filter(
    (entry): entry is [PermissionField, boolean] => typeof entry[1] === "boolean",
  );
  if (!updates.length) return NextResponse.json({ error: "No permissions to update" }, { status: 400 });

  const requestedIds = Array.from(
    new Set([...(body.staffIds ?? []), ...(body.staffId ? [body.staffId] : [])].filter(Boolean)),
  );
  const useDepartment = body.applyToDepartment === true;

  if (!requestedIds.length && !useDepartment) {
    return NextResponse.json({ error: "Select accounts or choose a department" }, { status: 400 });
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    let target: { rowCount?: number | null; rows: { id: string }[] };

    if (useDepartment) {
      const dept = (body.department || "all").toLowerCase();
      if (dept === "all") {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u WHERE u.is_active = true AND u.role NOT IN ('admin')`,
        );
      } else if (dept === "hotel_restaurant") {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           WHERE u.is_active = true AND u.role NOT IN ('admin')
             AND (
               LOWER(COALESCE(sp.department, '')) LIKE '%hotel%'
               OR LOWER(COALESCE(sp.department, '')) LIKE '%restaurant%'
               OR u.role IN ('frontDesk', 'housekeeping', 'kitchen', 'restaurantFrontDesk', 'waiterWaitress')
             )`,
        );
      } else if (dept === "hotel_operations") {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           WHERE u.is_active = true AND u.role NOT IN ('admin')
             AND (
               LOWER(COALESCE(sp.department, '')) LIKE '%hotel%'
               OR LOWER(COALESCE(sp.department, '')) LIKE '%operation%'
               OR u.role IN ('frontDesk', 'housekeeping', 'operationsManager')
             )`,
        );
      } else if (dept === "hotel") {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           WHERE u.is_active = true AND u.role NOT IN ('admin')
             AND (
               LOWER(COALESCE(sp.department, '')) LIKE '%hotel%'
               OR u.role IN ('frontDesk', 'housekeeping', 'hotelManager')
             )`,
        );
      } else if (dept === "restaurant") {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           WHERE u.is_active = true AND u.role NOT IN ('admin')
             AND (
               LOWER(COALESCE(sp.department, '')) LIKE '%restaurant%'
               OR u.role IN ('kitchen', 'restaurantFrontDesk', 'waiterWaitress', 'restaurantManager')
             )`,
        );
      } else if (dept === "operations") {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           WHERE u.is_active = true AND u.role NOT IN ('admin')
             AND (
               LOWER(COALESCE(sp.department, '')) LIKE '%operation%'
               OR u.role IN ('operationsManager')
             )`,
        );
      } else if (dept === "unassigned") {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           WHERE u.is_active = true AND u.role NOT IN ('admin')
             AND NULLIF(TRIM(sp.department), '') IS NULL`,
        );
      } else {
        target = await client.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN staff_profiles sp ON sp.user_id = u.id
           WHERE u.is_active = true AND u.role NOT IN ('admin')
             AND LOWER(COALESCE(sp.department, '')) = $1`,
          [dept],
        );
      }
    } else {
      target = await client.query<{ id: string }>(
        `SELECT u.id FROM users u WHERE u.id = ANY($1::uuid[]) AND u.is_active = true`,
        [requestedIds],
      );
    }

    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No active staff accounts matched the selection" }, { status: 404 });
    }

    for (const row of target.rows) {
      const params = [row.id, ...updates.map(([, value]) => value), session.id];
      const setClause = updates.map(([field], index) => `${field} = $${index + 2}`).join(", ");
      const updated = await client.query(
        `UPDATE attendance_feature_permissions SET ${setClause}, updated_by = $${updates.length + 2}, updated_at = now() WHERE staff_id = $1 RETURNING *`,
        params,
      );
      if (!updated.rowCount) {
        const flags = permissionFields.map((field) => values[field] ?? true);
        await client.query(
          `INSERT INTO attendance_feature_permissions (staff_id, leave_requests_enabled, planned_absence_enabled, attendance_exceptions_enabled, updated_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, ...flags, session.id],
        );
      }
    }

    await client.query("COMMIT");

    const ids = target.rows.map((row) => row.id);
    const refreshed = await query(
      `SELECT u.id AS staff_id,
              COALESCE(NULLIF(TRIM(u.name), ''), CONCAT_WS(' ', NULLIF(TRIM(sp.first_name), ''), NULLIF(TRIM(sp.last_name), '')), u.email, 'Staff member') AS staff_name,
              COALESCE(
                NULLIF(TRIM(sp.department), ''),
                CASE
                  WHEN u.role IN ('frontDesk', 'housekeeping', 'hotelManager') THEN 'Hotel'
                  WHEN u.role IN ('kitchen', 'restaurantFrontDesk', 'waiterWaitress', 'restaurantManager') THEN 'Restaurant'
                  WHEN u.role IN ('operationsManager') THEN 'Operations'
                  ELSE 'Restaurant'
                END
              ) AS department,
              COALESCE(
                NULLIF(TRIM(sp.job_classification), ''),
                NULLIF(TRIM(sp.position), ''),
                CASE
                  WHEN u.role = 'kitchen' THEN 'Chef'
                  WHEN u.role = 'frontDesk' THEN 'Reception'
                  WHEN u.role = 'restaurantFrontDesk' THEN 'Restaurant Front Desk / POS'
                  WHEN u.role = 'waiterWaitress' THEN 'Waiter/Waitress'
                  WHEN u.role = 'housekeeping' THEN 'Housekeeping'
                  WHEN u.role = 'hotelManager' THEN 'Hotel Manager'
                  WHEN u.role = 'restaurantManager' THEN 'Restaurant Manager'
                  WHEN u.role = 'operationsManager' THEN 'Operations Manager'
                  WHEN u.role = 'finance' THEN 'Finance'
                  ELSE 'Staff'
                END
              ) AS job_classification,
              COALESCE(NULLIF(TRIM(sp.position), ''), u.role::text) AS position,
              u.role::text AS role,
              COALESCE(afp.leave_requests_enabled, true) AS leave_requests_enabled,
              COALESCE(afp.planned_absence_enabled, true) AS planned_absence_enabled,
              COALESCE(afp.attendance_exceptions_enabled, true) AS attendance_exceptions_enabled
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN attendance_feature_permissions afp ON afp.staff_id = u.id
       WHERE u.id = ANY($1::uuid[])
       ORDER BY staff_name`,
      [ids],
    );

    return NextResponse.json({
      permissions: refreshed.rows,
      permission: refreshed.rows[0],
      updatedCount: refreshed.rowCount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[attendance] Bulk permission update failed:", error);
    return NextResponse.json({ error: "Unable to update permissions" }, { status: 500 });
  } finally {
    client.release();
  }
}
