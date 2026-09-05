import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  try {
    const result = await query(
      `SELECT id, check_in_at, check_out_at, status, verification_status, verified_at, late_minutes, early_checkout_minutes, notes
       FROM attendance_records WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [session.id]
    );
    return NextResponse.json({ record: result.rows[0] ?? null });
  } catch (cause) {
    console.error("[attendance] status failed", cause);
    return NextResponse.json({ error: "Unable to load register status" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.role === "admin") return NextResponse.json({ error: "Administrators review staff attendance instead of registering their own attendance" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action === "check_out" ? "check_out" : "check_in";
    const latest = await query(
      `SELECT id, check_in_at, check_out_at FROM attendance_records WHERE staff_id = $1 AND created_at::date = CURRENT_DATE ORDER BY created_at DESC LIMIT 1`,
      [session.id]
    );
    const current = latest.rows[0];
    if (action === "check_in") {
      if (current?.check_in_at && !current?.check_out_at) return NextResponse.json({ error: "You are already checked in" }, { status: 409 });
      const inserted = await query(
        `INSERT INTO attendance_records (staff_id, check_in_at, status, verification_status, notes) VALUES ($1, now(), 'pending_verification', 'pending', $2) RETURNING *`,
        [session.id, typeof body.notes === "string" ? body.notes.slice(0, 500) : null]
      );
      await query(
        `INSERT INTO notifications (recipient_user_id, title, message, type)
         SELECT id, $1, $2, 'attendance_check_in' FROM users
         WHERE role IN ('manager', 'operationsManager', 'admin') AND id <> $3 AND is_active = true`,
        ["Attendance check-in awaiting confirmation", `${session.email} checked in at ${new Date().toLocaleTimeString()}. Please confirm their presence.`, session.id],
      );
      return NextResponse.json({ record: inserted.rows[0] }, { status: 201 });
    }
    if (!current?.check_in_at || current.check_out_at) return NextResponse.json({ error: "Check in before checking out" }, { status: 409 });
    const updated = await query(
      `UPDATE attendance_records SET check_out_at = now(), status = 'checked_out', updated_at = now() WHERE id = $1 RETURNING *`,
      [current.id]
    );
    await query(
      `INSERT INTO notifications (recipient_user_id, title, message, type)
       SELECT id, $1, $2, 'attendance_check_out' FROM users
       WHERE role IN ('manager', 'operationsManager', 'admin') AND id <> $3 AND is_active = true`,
      ["Attendance check-out recorded", `${session.email} checked out at ${new Date().toLocaleTimeString()}.`, session.id],
    );
    return NextResponse.json({ record: updated.rows[0] });
  } catch (cause) {
    console.error("[attendance] register action failed", cause);
    return NextResponse.json({ error: "Unable to update register" }, { status: 500 });
  }
}
