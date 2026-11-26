import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { managementRoles } from "@/lib/roles";
import { ensureAttendanceSchema } from "@/lib/attendance-service";
import { publishRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const { session, error } = await requireRole(...managementRoles);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const attendanceId = typeof body.attendanceId === "string" ? body.attendanceId : "";
  const action = body.action === "extend" ? "extend" : body.action === "correct_checkout" ? "correct_checkout" : "";
  if (!attendanceId || !action) {
    return NextResponse.json({ apiVersion: "2", error: "attendanceId and a valid action are required" }, { status: 400 });
  }

  const canonicalNow = await getCanonicalTransactionTimestamp();
  const requestedCheckout = typeof body.checkOutAt === "string" ? body.checkOutAt : canonicalNow;
  try {
    await ensureAttendanceSchema();
    const result = await query(
      `UPDATE attendance_records
       SET check_out_at = CASE WHEN $2::text = 'extend' THEN NULL ELSE $3::timestamptz END,
           status = CASE WHEN $2::text = 'extend' THEN 'verified' ELSE 'manager_corrected' END,
           updated_at = $4::timestamptz,
           notes = CONCAT_WS(' ', notes, CASE WHEN $2::text = 'extend' THEN 'Manager extended the scheduled shift.' ELSE 'Manager corrected the checkout time.' END)
       WHERE id = $1::uuid
       RETURNING id, staff_id, check_in_at, check_out_at, status, verification_status, updated_at`,
      [attendanceId, action, requestedCheckout, canonicalNow],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ apiVersion: "2", error: "Attendance record not found" }, { status: 404 });
    }
    await publishRealtime("attendance.updated", String(result.rows[0].id)).catch(() => undefined);
    return NextResponse.json(
      { apiVersion: "2", record: result.rows[0], actorId: session.id },
      { headers: { "X-API-Version": "2", "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("[attendance] manager override failed", cause);
    return NextResponse.json({ apiVersion: "2", error: "Unable to update attendance override" }, { status: 500 });
  }
}

export function OPTIONS() {
  return NextResponse.json({ apiVersion: "2", status: "ok" }, { headers: { "X-API-Version": "2" } });
}
