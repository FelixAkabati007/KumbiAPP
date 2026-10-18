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
      `SELECT id, staff_id, expires_at, used_at FROM password_reset_tokens
       WHERE LOWER(email) = LOWER($1) AND token_hash = $2 AND used_at IS NULL
       AND expires_at > NOW()`,
      [email.trim(), tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    const tokenData = tokenRes.rows[0];

    // Update both credential stores used by staff and standard user login.
    const hashedPassword = await hashPassword(password);
    await query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)",
      [hashedPassword, email.trim()]
    );
    if (tokenData.staff_id) {
      await query(
        "UPDATE staff_profiles SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2",
        [hashedPassword, tokenData.staff_id]
      );
    }

    // Consume the token only after a successful credential update.
    await query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL",
      [tokenData.id]
    );

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
