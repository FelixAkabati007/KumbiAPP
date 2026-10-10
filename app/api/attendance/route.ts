import { NextResponse } from "next/server";
import { requirePermission, requireRole, requireSession } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { registerAttendance } from "@/lib/attendance-service";
import { propertyDayExpression } from "@/lib/operational-day";
import { canUseAttendanceRegister } from "@/lib/roles";

export async function GET(request: Request) {
  const sessionAccess = await requireSession();
  if (!sessionAccess.error && sessionAccess.session && !canUseAttendanceRegister(sessionAccess.session.role)) {
    return NextResponse.json({ record: null, canCheckIn: false, nextAction: "not_applicable" });
  }
  const staffAccess = await requireSession();
  if (!staffAccess.error && staffAccess.session) {
    const result = await query(
      `SELECT id, staff_id, check_in_at, check_out_at, status, verification_status, verified_at
       FROM attendance_records
       WHERE (staff_id = $1 OR staff_id = (SELECT id FROM staff_profiles WHERE user_id = $1 LIMIT 1))
         AND created_at::date = ${propertyDayExpression()}
       ORDER BY created_at DESC LIMIT 1`,
      [staffAccess.session.id],
    );
    const record = result.rows[0] ?? null;
    const isAttendanceParticipant = !["admin", "manager"].includes(String(staffAccess.session.role));
    return NextResponse.json({ record, canCheckIn: isAttendanceParticipant, nextAction: isAttendanceParticipant ? (!record?.check_in_at ? "check_in" : !record.check_out_at ? "waiting" : "complete") : "not_applicable" });
  }
  const { error } = await requirePermission("events");
  if (error) return error;
  const eventId = new URL(request.url).searchParams.get("eventId");
  const result = await query(
    `SELECT id, user_id, event_id, clock_in, clock_out, gps_in_lat, gps_in_long, gps_out_lat, gps_out_long, is_out_of_bounds, status, approved_by, approved_at, notes, created_at
     FROM attendance_logs WHERE ($1::uuid IS NULL OR event_id = $1::uuid) ORDER BY created_at DESC`,
    [eventId || null],
  );
  return NextResponse.json({ attendance: result.rows });
}

export async function POST(request: Request) {
  const staffAccess = await requireSession();
  if (!staffAccess.error && staffAccess.session && canUseAttendanceRegister(staffAccess.session.role)) {
    const body = await request.json();
    if (body.action !== "check_in") {
      return NextResponse.json({ error: "Manual checkout is permanently disabled. Checkout is completed automatically from the approved schedule.", code: "MANUAL_CHECKOUT_DISABLED" }, { status: 410 });
    }
    try {
      const result = await registerAttendance(staffAccess.session, "check_in", String(body.notes ?? ""));
      return NextResponse.json(result, { status: 200 });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "ATTENDANCE_FAILED";
      const messages: Record<string, string> = {
        ALREADY_CHECKED_IN: "You are already checked in.",
        CHECK_IN_REQUIRED: "Check in before checking out.",
        CHECKOUT_TOO_EARLY: "Check-out is only available at or after your scheduled end time.",
        CHECKIN_OUTSIDE_SCHEDULE: "Check-in is available for your current shift.",
        MANUAL_CHECKOUT_DISABLED: "Check-out is completed automatically from the approved Staff schedule.",
        ALREADY_CHECKED_OUT: "Attendance is already completed for today.",
      };
      return NextResponse.json({ error: messages[code] ?? "Unable to update attendance", code }, { status: 409 });
    }
  }
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const body = await request.json();
  const eventId = body.eventId ? String(body.eventId) : null;
  const action = body.action === "clock_out" ? "clock_out" : "clock_in";
  const latitude = body.latitude == null ? null : Number(body.latitude);
  const longitude = body.longitude == null ? null : Number(body.longitude);
  if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
    return NextResponse.json({ error: "Invalid GPS coordinates" }, { status: 400 });
  }
  const result = await query(
    action === "clock_in"
      ? `INSERT INTO attendance_logs (user_id, event_id, clock_in, gps_in_lat, gps_in_long, is_out_of_bounds, status, notes) VALUES ($1, $2, NOW(), $3, $4, $5, 'pending', $6) RETURNING *`
      : `UPDATE attendance_logs SET clock_out = NOW(), gps_out_lat = $2, gps_out_long = $3, updated_at = NOW() WHERE id = $1 AND user_id = $4 AND clock_out IS NULL RETURNING *`,
    action === "clock_in" ? [session.id, eventId, latitude, longitude, Boolean(body.isOutOfBounds), String(body.notes ?? "").trim() || null] : [String(body.attendanceId ?? ""), latitude, longitude, session.id],
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Attendance record not found or already closed" }, { status: 404 });
  return NextResponse.json({ attendance: result.rows[0] }, { status: action === "clock_in" ? 201 : 200 });
}
