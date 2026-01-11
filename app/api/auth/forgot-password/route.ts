import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { buildPasswordResetEmail, sendEmail } from "@/lib/email";
import crypto from "crypto";
import env from "@/lib/env";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const userRes = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (userRes.rows.length === 0) {
      // Don't reveal user existence
      return NextResponse.json({
        success: true,
        message: "If an account exists, a password reset link has been sent.",
      });
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresMinutes = 60;

    // Store token
    await query(
      `INSERT INTO password_reset_tokens (email, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${expiresMinutes} minutes')`,
      [email, tokenHash]
    );

    // Send email
    const appUrl = env.APP_URL || "http://localhost:3000";
    const link = `${appUrl}/reset-password?token=${encodeURIComponent(
      rawToken
    )}&email=${encodeURIComponent(email)}`;
    
    const { subject, text, html } = buildPasswordResetEmail(link);
    await sendEmail({ to: email, subject, text, html });

    return NextResponse.json({
      success: true,
      message: "If an account exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong" },
      { status: 500 }
    );
  }
}
