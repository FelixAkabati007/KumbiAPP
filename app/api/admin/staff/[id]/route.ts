import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-logger";

// GET - Get staff member details
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

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
        u.role,
        sp.created_at,
        sp.updated_at
       FROM staff_profiles sp
       JOIN users u ON sp.user_id = u.id
       WHERE sp.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json(
      { error: "Failed to fetch staff member" },
      { status: 500 }
    );
  }
}

// PATCH - Update staff member (admin only, no approval needed)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const {
      firstName,
      lastName,
      phone,
      department,
      position,
      employmentStatus,
    } = body;

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    // Get current staff data for comparison
    const currentResult = await query(
      `SELECT * FROM staff_profiles WHERE id = $1`,
      [id]
    );

    if (currentResult.rows.length === 0) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const currentStaff = currentResult.rows[0];
    const changes: Record<string, unknown> = {};

    if (firstName && firstName !== currentStaff.first_name) {
      changes.first_name = { from: currentStaff.first_name, to: firstName };
    }
    if (lastName && lastName !== currentStaff.last_name) {
      changes.last_name = { from: currentStaff.last_name, to: lastName };
    }
    if (phone && phone !== currentStaff.phone) {
      changes.phone = { from: currentStaff.phone, to: phone };
    }
    if (department && department !== currentStaff.department) {
      changes.department = { from: currentStaff.department, to: department };
    }
    if (position && position !== currentStaff.position) {
      changes.position = { from: currentStaff.position, to: position };
    }
    if (employmentStatus && employmentStatus !== currentStaff.employment_status) {
      changes.employment_status = {
        from: currentStaff.employment_status,
        to: employmentStatus,
      };
    }

    // Update staff profile
    await query(
      `UPDATE staff_profiles 
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = COALESCE($3, phone),
           department = COALESCE($4, department),
           position = COALESCE($5, position),
           employment_status = COALESCE($6, employment_status),
           updated_at = NOW()
       WHERE id = $7`,
      [
        firstName || null,
        lastName || null,
        phone || null,
        department || null,
        position || null,
        employmentStatus || null,
        id,
      ]
    );

    // Log to audit trail
    await createAuditLog({
      actionType: "staff_updated",
      actorId: session.id,
      actorName: session.email,
      actorRole: session.role,
      targetStaffId: id,
      targetStaffName: `${firstName || currentStaff.first_name} ${lastName || currentStaff.last_name}`,
      changeDetails: changes,
      ipAddress,
    });

    return NextResponse.json({
      message: "Staff member updated successfully",
    });
  } catch (error) {
    console.error("Error updating staff:", error);
    return NextResponse.json(
      { error: "Failed to update staff member" },
      { status: 500 }
    );
  }
}

// DELETE - Delete staff member (admin only, no approval needed)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    // Get staff data before deletion
    const staffResult = await query(
      `SELECT sp.*, u.id as user_id FROM staff_profiles sp
       JOIN users u ON sp.user_id = u.id
       WHERE sp.id = $1`,
      [id]
    );

    if (staffResult.rows.length === 0) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const staff = staffResult.rows[0];

    // Soft delete or hard delete based on requirements
    // Soft delete: Mark as inactive
    await query(
      `UPDATE staff_profiles 
       SET is_active = false, employment_status = 'terminated', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Log to audit trail
    await createAuditLog({
      actionType: "staff_deleted",
      actorId: session.id,
      actorName: session.email,
      actorRole: session.role,
      targetStaffId: id,
      targetStaffName: `${staff.first_name} ${staff.last_name}`,
      changeDetails: {
        email: staff.business_email,
        department: staff.department,
        position: staff.position,
      },
      ipAddress,
    });

    return NextResponse.json({
      message: "Staff member deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting staff:", error);
    return NextResponse.json(
      { error: "Failed to delete staff member" },
      { status: 500 }
    );
  }
}
