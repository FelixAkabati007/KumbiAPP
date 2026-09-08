import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { updateStaffPassword } from "@/lib/password-manager";

const recoverySchema = z.object({
  recoverySecret: z.string().min(1),
  email: z.string().email(),
  password: z
    .string()
    .min(12)
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/),
});

function getRecoverySecret() {
  return process.env.KUMRESH_DB_STACK_SECRET_SERVER_KEY || process.env.ADMIN_RECOVERY_SECRET;
}

export async function POST(request: Request) {
  try {
    const parsed = recoverySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid recovery request" }, { status: 400 });
    }

    const configuredSecret = getRecoverySecret();
    if (!configuredSecret || parsed.data.recoverySecret !== configuredSecret) {
      console.warn("[auth] Emergency recovery rejected");
      return NextResponse.json({ success: false, error: "Recovery request could not be completed" }, { status: 403 });
    }

    const staffResult = await query(
      `SELECT sp.id
       FROM staff_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE LOWER(TRIM(sp.business_email)) = LOWER(TRIM($1))
         AND sp.is_active = true
         AND sp.employment_status = 'active'
         AND LOWER(u.role) IN ('admin', 'manager')
       LIMIT 1`,
      [parsed.data.email],
    );

    if (staffResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Recovery request could not be completed" }, { status: 404 });
    }

    const staffId = staffResult.rows[0].id as string;
    await updateStaffPassword(staffId, parsed.data.password);
    await query("UPDATE staff_sessions SET is_active = false, logged_out_at = NOW() WHERE staff_id = $1", [staffId]);

    return NextResponse.json({ success: true, message: "Password updated. You can now sign in." });
  } catch (error) {
    console.error("[auth] Emergency recovery failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ success: false, error: "Recovery request could not be completed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
