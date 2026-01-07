import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { recordSignupAttempt, isRateLimited } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const cleanEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanPassword = typeof password === "string" ? password : "";
    if (!cleanEmail || !cleanPassword) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing credentials",
          code: "validation_error",
        },
        { status: 400 }
      );
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email address",
          code: "validation_error",
        },
        { status: 400 }
      );
    }
    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    await recordSignupAttempt(cleanEmail, ip);
    const limited = await isRateLimited(cleanEmail, ip, 15, 10);
    if (limited) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many login attempts",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }

    const result = await query("SELECT * FROM users WHERE email = $1", [
      cleanEmail,
    ]);
    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid credentials",
          code: "invalid_credentials",
        },
        { status: 401 }
      );
    }

    const user = result.rows[0];
    const isValid = await comparePassword(cleanPassword, user.password_hash);

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid credentials",
          code: "invalid_credentials",
        },
        { status: 401 }
      );
    }

    if (!user.email_verified) {
      return NextResponse.json(
        {
          success: false,
          error: "Email not verified",
          code: "email_unverified",
        },
        { status: 403 }
      );
    }

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

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Login failed", code: "server_error" },
      { status: 500 }
    );
  }
}
