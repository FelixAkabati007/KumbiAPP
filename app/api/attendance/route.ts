import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";

export async function GET(request: Request) {
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
