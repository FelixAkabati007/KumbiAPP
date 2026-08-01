import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hash } from "bcryptjs";

// GET all staff
export async function GET() {
  try {
    const result = await query(
      `SELECT id, email, name, role, username, avatar_url, is_active, last_login, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 });
  }
}

// POST create new staff member
export async function POST(request: NextRequest) {
  try {
    const { name, email, role, password, username } = await request.json();

    if (!name || !email || !role || !password) {
      return NextResponse.json(
        { error: "Name, email, role and password are required" },
        { status: 400 }
      );
    }

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const password_hash = await hash(password, 10);

    const result = await query(
      `INSERT INTO users (name, email, role, password_hash, username, is_active, email_verified)
       VALUES ($1, $2, $3, $4, $5, true, true)
       RETURNING id, name, email, role, username, is_active, created_at`,
      [name, email, role, password_hash, username || null]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating staff:", error);
    return NextResponse.json({ error: "Failed to create staff member" }, { status: 500 });
  }
}
