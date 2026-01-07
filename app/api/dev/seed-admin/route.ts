import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST() {
  try {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const email = "admin@example.com";
    const username = "admin";
    const name = "Admin User";
    const role = "admin";
    const password = "Admin@123";

    const exists = await query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (exists.rows.length > 0) {
      return NextResponse.json({ seeded: false, message: "Admin exists" });
    }

    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, username, name, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, username, name, role`,
      [email, username, name, role, passwordHash]
    );

    return NextResponse.json({
      seeded: true,
      admin: result.rows[0],
    });
  } catch {
    return NextResponse.json({ error: "Seeding failed" }, { status: 500 });
  }
}
