import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateSystemState } from "@/lib/system-sync";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { role, name, email } = body;

    // Validate input (basic)
    if (!role && !name && !email) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Build query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let queryIndex = 1;

    if (role) {
      updates.push(`role = $${queryIndex++}`);
      values.push(role);
    }
    if (name) {
      updates.push(`name = $${queryIndex++}`);
      values.push(name);
    }
    if (email) {
      updates.push(`email = $${queryIndex++}`);
      values.push(email);
    }

    // Add ID as the last parameter
    values.push(id);

    const updateQuery = `
      UPDATE users 
      SET ${updates.join(", ")}, updated_at = NOW() 
      WHERE id = $${queryIndex} 
      RETURNING id, email, name, role
    `;

    const result = await query(updateQuery, values);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updatedUser = result.rows[0];

    // Audit Log
    await logAudit({
      action: "UPDATE_USER",
      entityType: "USER",
      entityId: id,
      details: { updates: body, previous: "unknown" }, // Ideally we'd fetch previous state first
      performedBy: session.id,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
    });

    // Trigger Sync
    await updateSystemState("users");

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    // Prevent self-deletion
    if (id === session.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    const result = await query(
      "DELETE FROM users WHERE id = $1 RETURNING id, email",
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Audit Log
    await logAudit({
      action: "DELETE_USER",
      entityType: "USER",
      entityId: id,
      details: { email: result.rows[0].email },
      performedBy: session.id,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
    });

    // Trigger Sync
    await updateSystemState("users");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
