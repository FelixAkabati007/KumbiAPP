import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import crypto from "crypto";
import { z } from "zod";

const resetSchema = z.object({
  email: z.string().email(),
  token: z.string(),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message:
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    }),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = resetSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, token, password } = result.data;

    // Verify token
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const tokenRes = await query(
      `SELECT id, expires_at, used_at FROM password_reset_tokens
       WHERE email = $1 AND token_hash = $2 AND used_at IS NULL`,
      [email, tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    const tokenData = tokenRes.rows[0];
    if (new Date() > new Date(tokenData.expires_at)) {
      return NextResponse.json(
        { success: false, error: "Token has expired" },
        { status: 400 }
      );
    }

    // Update password
    const hashedPassword = await hashPassword(password);
    await query("UPDATE users SET password_hash = $1 WHERE email = $2", [
      hashedPassword,
      email,
    ]);

    // Mark token used
    await query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [
      tokenData.id,
    ]);

    return NextResponse.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong" },
      { status: 500 }
    );
  }
}
