import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { email, token } = await req.json();
    if (!email || !token) {
      return NextResponse.json(
        { success: false, error: "Missing token or email", code: "validation_error" },
        { status: 400 }
      );
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const rawToken = String(token);
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const res = await query<{
      id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, expires_at, used_at FROM email_verification_tokens WHERE email = $1 AND token_hash = $2`,
      [cleanEmail, tokenHash]
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token", code: "invalid_token" },
        { status: 400 }
      );
    }

    const row = res.rows[0];
    if (row.used_at) {
      return NextResponse.json(
        { success: false, error: "Token already used", code: "invalid_token" },
        { status: 400 }
      );
    }

    const userRes = await query<{ id: string; email: string; role: string }>(
      `UPDATE users SET email_verified = TRUE WHERE email = $1 RETURNING id, email, role`,
      [cleanEmail]
    );
    const user = userRes.rows[0];
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found", code: "not_found" },
        { status: 404 }
      );
    }

    // Mark token used
    await query(`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);

    // Issue auth cookie
    const jwt = signToken({ id: user.id, email: user.email, role: user.role });
    (await cookies()).set("auth_token", jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 86400,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.json(
      { success: false, error: "Verification failed", code: "server_error" },
      { status: 500 }
    );
  }
}
