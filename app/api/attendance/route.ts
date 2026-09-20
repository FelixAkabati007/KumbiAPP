import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";
import { registerAttendance } from "@/lib/attendance-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  try {
    const result = await query(
      `SELECT id, check_in_at, check_out_at, status, verification_status, verified_at, late_minutes, early_checkout_minutes, notes
       FROM attendance_records WHERE staff_id = $1 AND check_in_at::date = CURRENT_DATE ORDER BY check_in_at DESC LIMIT 1`,
      [session.id]
    );
    const record = result.rows[0] ?? null;
    const nextAction = record?.check_in_at && !record?.check_out_at ? "check_out" : record?.check_out_at ? "complete" : "check_in";
    return NextResponse.json({ record, nextAction });
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
    const result = await registerAttendance(session, action, typeof body.notes === "string" ? body.notes : undefined);
    await publishRealtime("attendance.updated", session.id);
    return NextResponse.json({ ...result, message: action === "check_in" ? "Check-in successful" : "Check-out successful" }, { status: action === "check_in" ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "ALREADY_CHECKED_IN") return NextResponse.json({ error: "You are already checked in" }, { status: 409 });
    if (cause instanceof Error && cause.message === "CHECK_IN_REQUIRED") return NextResponse.json({ error: "Check in before checking out" }, { status: 409 });
    if (cause instanceof Error && cause.message === "ALREADY_CHECKED_OUT") return NextResponse.json({ error: "Attendance is already checked out" }, { status: 409 });
    console.error("[attendance] register action failed", cause);
    return NextResponse.json({ error: "Unable to update register" }, { status: 500 });
  }
}
