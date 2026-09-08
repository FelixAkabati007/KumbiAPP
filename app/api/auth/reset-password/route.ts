import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { updateStaffPassword } from "@/lib/password-manager";
import crypto from "crypto";
import { z } from "zod";

const resetSchema = z.object({
  email: z.string().email(),
  token: z.string(),
  password: z
    .string()
    .min(12, { message: "Password must be at least 12 characters" })
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
      message:
        "Password must contain uppercase, lowercase, number, and special character",
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
      `SELECT prt.id, prt.staff_id, prt.expires_at
       FROM password_reset_tokens prt
       JOIN staff_profiles sp ON sp.id = prt.staff_id
       WHERE LOWER(TRIM(sp.business_email)) = LOWER(TRIM($1))
         AND prt.token_hash = $2
         AND prt.is_used = false
         AND prt.expires_at > NOW()
         AND sp.is_active = true
         AND sp.employment_status = 'active'`,
      [email, tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    const tokenData = tokenRes.rows[0];

    await updateStaffPassword(tokenData.staff_id, password);

    const consumedToken = await query(
      `UPDATE password_reset_tokens
       SET is_used = true, used_at = NOW()
       WHERE id = $1 AND is_used = false
       RETURNING id`,
      [tokenData.id]
    );

    if (consumedToken.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "This reset link has already been used" },
        { status: 400 }
      );
    }

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
