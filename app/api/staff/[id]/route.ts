import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hash } from "bcryptjs";

// PUT update staff member
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { name, email, role, username, is_active, password } = await request.json();

    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Name, email and role are required" },
        { status: 400 }
      );
    }

    // Check email uniqueness (exclude current user)
    const existing = await query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, id]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    let updateQuery: string;
    let params: (string | boolean | null)[];

    if (password) {
      const password_hash = await hash(password, 10);
      updateQuery = `UPDATE users SET name=$1, email=$2, role=$3, username=$4, is_active=$5, password_hash=$6, updated_at=NOW()
                     WHERE id=$7 RETURNING id, name, email, role, username, is_active, created_at`;
      params = [name, email, role, username || null, is_active ?? true, password_hash, id];
    } else {
      updateQuery = `UPDATE users SET name=$1, email=$2, role=$3, username=$4, is_active=$5, updated_at=NOW()
                     WHERE id=$6 RETURNING id, name, email, role, username, is_active, created_at`;
      params = [name, email, role, username || null, is_active ?? true, id];
    }

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating staff:", error);
    return NextResponse.json({ error: "Failed to update staff member" }, { status: 500 });
  }
}

// PATCH toggle active status
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { is_active } = await request.json();

    const result = await query(
      `UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2
       RETURNING id, name, email, role, is_active`,
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error toggling staff status:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
