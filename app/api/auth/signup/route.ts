import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { buildVerificationEmail, sendEmail } from "@/lib/email";
import { signUpWithEmail } from "@/lib/auth-neon";
import { recordSignupAttempt, isRateLimited } from "@/lib/rate-limit";
import { signupSchema } from "@/lib/validations/auth";
import env from "@/lib/env";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Zod Validation
    const validationResult = signupSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: validationResult.error.errors[0].message,
          code: "validation_error",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password, name, role, username, confirm_email_address } =
      validationResult.data;

    // Honeypot check
    if (confirm_email_address) {
      console.warn(
        `[Bot Protection] Honeypot triggered by IP: ${req.headers.get("x-forwarded-for") || "unknown"}`
      );
      return NextResponse.json({
        success: true,
        message: "Please return to Sign In page to login.",
      });
    }

    // Rate limit check
    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;

    await recordSignupAttempt(email, ip);
    const limited = await isRateLimited(email, ip, 60, 5);
    if (limited) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many signup attempts. Try later.",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }

    // Check if user exists locally first (fast fail)
    const existingUser = await query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: "User already exists", code: "conflict" },
        { status: 409 }
      );
    }

    // Default role
    const userRole = role || "staff";

    // Neon Auth Integration
    if (process.env.NEON_AUTH_API_URL) {
      try {
        const result = await signUpWithEmail(email, name, password);
        if (result?.error) {
          return NextResponse.json(
            {
              success: false,
              error: result.error.message || "Neon Auth failed",
              code: "auth_provider_error",
            },
            { status: 400 }
          );
        }

        // Neon Auth Success: Insert into local DB without password hash
        await query(
          `INSERT INTO users (email, password_hash, name, role, email_verified) VALUES ($1, $2, $3, $4, FALSE)`,
          [email, "NEON_AUTH_MANAGED", name, userRole]
        );

        return NextResponse.json({
          success: true,
          message: "Account created successfully.",
        });
      } catch (e: any) {
        console.error("Neon Auth Signup Error:", e);
        return NextResponse.json(
          {
            success: false,
            error: "Authentication provider error",
            code: "server_error",
          },
          { status: 500 }
        );
      }
    } else {
      // Legacy Fallback
      console.warn("NEON_AUTH_API_URL not set. Using Legacy Auth.");

      const hashedPassword = await hashPassword(password);

      const result = await query(
        `INSERT INTO users (email, password_hash, name, role, email_verified) VALUES ($1, $2, $3, $4, FALSE) RETURNING id, email, name, role`,
        [email, hashedPassword, name, userRole]
      );

      const user = result.rows[0];

      // Generate verification token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");
      const expiresMinutes = 30;
      await query(
        `INSERT INTO email_verification_tokens (email, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${expiresMinutes} minutes')`,
        [user.email, tokenHash]
      );

      // Send email
      const appUrl = env.APP_URL || "http://localhost:5173";
      const link = `${appUrl}/auth/verify?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(
        user.email
      )}`;
      const { subject, text, html } = buildVerificationEmail(link);
      await sendEmail({ to: user.email, subject, text, html });

      return NextResponse.json({
        success: true,
        message: "Please return to Sign In page to login.",
      });
    }
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { success: false, error: "Signup failed", code: "server_error" },
      { status: 500 }
    );
  }
}
