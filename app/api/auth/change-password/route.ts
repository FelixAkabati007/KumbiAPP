import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { comparePassword, hashPassword } from "@/lib/auth";
import { validateSession } from "@/lib/session-manager";
import { cookies } from "next/headers";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

export async function POST(request: NextRequest) {
  try {
    const sessionToken = (await cookies()).get("session_token")?.value;
    if (!sessionToken) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const session = await validateSession(sessionToken);
    if (!session) return NextResponse.json({ error: "Your session has expired" }, { status: 401 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Use a password with at least 8 characters, including uppercase, lowercase, and a number" }, { status: 400 });

    const result = await query(
      `SELECT u.id, u.password_hash FROM users u JOIN staff_profiles sp ON sp.user_id = u.id WHERE sp.id = $1 AND sp.employment_status = 'active' LIMIT 1`,
      [session.staffId]
    );
    if (!result.rows[0] || !(await comparePassword(parsed.data.currentPassword, result.rows[0].password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, result.rows[0].id]);
    return NextResponse.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("[v0] Password change failed:", error);
    return NextResponse.json({ error: "Unable to update password right now" }, { status: 500 });
  }
}
