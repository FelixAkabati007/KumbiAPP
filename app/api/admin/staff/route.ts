import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-logger";
import { validatePasswordComplexity } from "@/lib/password-manager";
import { v4 as uuidv4 } from "uuid";

const VALID_ROLES = [
  "admin",
  "manager",
  "finance",
  "staff",
  "kitchen",
  "frontDesk",
  "housekeeping",
];

// GET - List all staff members
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Managers need the directory to initiate permitted password resets.
    if (!["admin", "manager"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const department = url.searchParams.get("department");
    const status = url.searchParams.get("status");

    const whereConditions = ["sp.is_active = true", "u.is_active = true"];
    const params: (string | number)[] = [];
    let paramCount = 1;

    if (department) {
      whereConditions.push(`sp.department = $${paramCount}`);
      params.push(department);
      paramCount++;
    }

    if (status) {
      whereConditions.push(`sp.employment_status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    const whereClause = whereConditions.join(" AND ");

    const result = await query(
      `SELECT 
        sp.id,
        sp.user_id,
        sp.first_name,
        sp.last_name,
        sp.business_email,
        sp.phone,
        sp.department,
        sp.position,
        sp.employment_status,
        sp.hire_date,
        sp.manager_scope,
        u.role,
        sp.created_at,
        sp.updated_at
       FROM staff_profiles sp
       JOIN users u ON sp.user_id = u.id
       WHERE ${whereClause}
       ORDER BY sp.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      data: result.rows || [],
      total: result.rowCount,
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json(
      { error: "Failed to fetch staff members" },
      { status: 500 }
    );
  }
}

// POST - Create new staff member (admin only, no approval needed)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const phone = String(body.phone ?? "").trim() || null;
    const department = String(body.department ?? "").trim();
    const position = String(body.position ?? "").trim();
    const hireDate = String(body.hireDate ?? "").trim();
    const password = String(body.password ?? "");
    const businessEmail = String(body.businessEmail ?? "").trim().toLowerCase();
    const role = body.role === undefined ? "staff" : String(body.role);
    const managerScope = String(body.managerScope ?? "general");

    if (role === "manager" && !["hotel", "restaurant", "general"].includes(managerScope)) {
      return NextResponse.json({ error: "Invalid manager scope" }, { status: 400 });
    }

    // Validate required fields
    if (
      !firstName ||
      !lastName ||
      !businessEmail ||
      !password ||
      !department ||
      !position
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
      return NextResponse.json({ error: "Enter a valid business email address" }, { status: 400 });
    }

    if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
      return NextResponse.json({ error: "Hire date must use YYYY-MM-DD format" }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const staffRole = role;

    // Validate password complexity
    const passwordValidation = validatePasswordComplexity(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: passwordValidation.errors },
        { status: 400 }
      );
    }

    // Check if email already exists — enforced against both the staff
    // profile table and the core users table so every account (staff or
    // otherwise) is guaranteed a unique, isolated login.
    const emailCheck = await query(
      "SELECT id FROM staff_profiles WHERE business_email = $1",
      [businessEmail]
    );
    const userEmailCheck = await query(
      "SELECT id FROM users WHERE email = $1",
      [businessEmail]
    );

    if (
      (emailCheck.rows && emailCheck.rows.length > 0) ||
      (userEmailCheck.rows && userEmailCheck.rows.length > 0)
    ) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 400 }
      );
    }

    const userId = uuidv4();
    const staffId = uuidv4();
    const passwordHash = await hashPassword(password);
    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO users (
          id, email, name, role, password_hash, email_verified, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          businessEmail,
          `${firstName} ${lastName}`,
          staffRole,
          passwordHash,
          true,
          true,
        ]
      );

      await client.query(
        `INSERT INTO staff_profiles (
          id, user_id, first_name, last_name, business_email, phone,
          department, position, hire_date, password_hash, created_by,
          employment_status, is_active, manager_scope
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          staffId,
          userId,
          firstName,
          lastName,
          businessEmail,
          phone || null,
          department,
          position,
          hireDate || null,
          passwordHash,
          session.id,
          "active",
          true,
          staffRole === "manager" ? managerScope : "general",
        ]
      );
    });

    try {
      await createAuditLog({
        actionType: "staff_created",
        actorId: session.id,
        actorName: session.email,
        actorRole: session.role,
        targetStaffId: staffId,
        targetStaffName: `${firstName} ${lastName}`,
        changeDetails: { email: businessEmail, department, position },
        ipAddress,
      });
    } catch (auditError) {
      console.error("[v0] Staff created but audit log failed:", auditError);
    }

    return NextResponse.json(
      { message: "Staff member created successfully", staffId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating staff:", error);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Failed to create staff member" },
      { status: 500 }
    );
  }
}
