import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { buildVerificationEmail, sendEmail } from "@/lib/email";
import { recordSignupAttempt, isRateLimited } from "@/lib/rate-limit";
import env from "@/lib/env";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { email, password, name, role, username } = await req.json();

    // Extract IP (best-effort)
    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;

    // Rate limit check (email+ip)
    await recordSignupAttempt(email || null, ip);
    const limited = await isRateLimited(email || null, ip, 60, 5);
    if (limited) {
      return NextResponse.json(
        { success: false, error: "Too many signup attempts. Try later.", code: "rate_limited" },
        { status: 429 }
      );
    }

    // Server-side validation/sanitization
    const clean = {
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
      password: typeof password === "string" ? password : "",
      name: typeof name === "string" ? name.trim() : "",
      role: typeof role === "string" ? role.trim() : "staff",
      username: typeof username === "string" ? username.trim() : "",
    };

    if (!clean.email || !clean.password || !clean.name) {
      return NextResponse.json(
        { success: false, error: "Missing required fields", code: "validation_error" },
        { status: 400 }
      );
    }
    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean.email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address", code: "validation_error" },
        { status: 400 }
      );
    }
    // Username allowlist
    if (clean.username && !/^[a-zA-Z0-9_]+$/.test(clean.username)) {
      return NextResponse.json(
        { success: false, error: "Invalid username", code: "validation_error" },
        { status: 400 }
      );
    }
    // Password policy
    if (
      clean.password.length < 8 ||
      !/[A-Z]/.test(clean.password) ||
      !/[a-z]/.test(clean.password) ||
      !/\d/.test(clean.password)
    ) {
      return NextResponse.json(
        { success: false, error: "Weak password", code: "validation_error" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [clean.email, clean.username || ""]
    );
    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: "User already exists", code: "conflict" },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(clean.password);

    // Default role if not provided
    const userRole = clean.role || "staff";

    const result = await query(
      `INSERT INTO users (email, password_hash, name, role, username, email_verified) VALUES ($1, $2, $3, $4, $5, FALSE) RETURNING id, email, name, role, username`,
      [clean.email, hashedPassword, clean.name, userRole, clean.username || null]
    );

    const user = result.rows[0];

    // Generate verification token and store HASH
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresMinutes = 30;
    await query(
      `INSERT INTO email_verification_tokens (email, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${expiresMinutes} minutes')`,
      [user.email, tokenHash]
    );

    // Build verification link and send email
    const appUrl = env.APP_URL || "http://localhost:5173";
    const link = `${appUrl}/auth/verify?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(
      user.email
    )}`;
    const { subject, text, html } = buildVerificationEmail(link);
    await sendEmail({ to: user.email, subject, text, html });

    return NextResponse.json({
      success: true,
      message: "Verification email sent. Please check your inbox.",
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { success: false, error: "Signup failed", code: "server_error" },
      { status: 500 }
    );
  }
}
