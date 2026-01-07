import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { email, password, name, role, username } = await req.json();

    // Basic validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username || ""]
    );
    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: "User already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);

    // Default role if not provided
    const userRole = role || "staff";

    const result = await query(
      `INSERT INTO users (email, password_hash, name, role, username) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, username`,
      [email, hashedPassword, name, userRole, username]
    );

    const user = result.rows[0];
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    (await cookies()).set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 86400, // 1 day
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { success: false, error: "Signup failed" },
      { status: 500 }
    );
  }
}
