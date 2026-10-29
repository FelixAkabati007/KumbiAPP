import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { recordAndCheckLoginAttempt } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Zod Validation
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: validationResult.error.errors[0].message,
          code: "validation_error",
        },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;
    const cleanEmail = email.toLowerCase();

    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const limited = await recordAndCheckLoginAttempt(cleanEmail, ip, 10, 15);
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

    const result = await query(
      `SELECT id, email, name, role, password_hash, COALESCE(email_verified, TRUE) as email_verified, COALESCE(is_active, TRUE) as is_active
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [cleanEmail]
    );
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

    if (user.is_active === false) {
      return NextResponse.json(
        {
          success: false,
          error: "Account has been deactivated",
          code: "account_deactivated",
        },
        { status: 401 }
      );
    }

    const isValid = await comparePassword(password, user.password_hash);

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

    // Record last login timestamp (safe if query mock returns undefined in unit tests)
    try {
      const updatePromise = query(
        `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`,
        [user.id]
      );
      if (updatePromise && typeof updatePromise.catch === "function") {
        await updatePromise.catch(() => {});
      }
    } catch {
      // ignore
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    (await cookies()).set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
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
