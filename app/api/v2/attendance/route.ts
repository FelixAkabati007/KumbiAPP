import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getTodayAttendanceRecord, registerAttendance } from "@/lib/attendance-service";
import { managementRoles } from "@/lib/roles";

export const dynamic = "force-dynamic";

const headers = { "X-API-Version": "2", "Cache-Control": "no-store, no-cache, must-revalidate" };

function statusLabel(value?: string | null) {
  return ({ pending: "waiting_for_approval", verified: "approved", rejected: "rejected", late: "approved_late" } as Record<string, string>)[value ?? ""] ?? value ?? "not_checked_in";
}

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  try {
    const record = await getTodayAttendanceRecord(session);
    return NextResponse.json(
      {
        apiVersion: "2",
        record: record ? { ...record, lifecycleStatus: statusLabel(record.verification_status) } : null,
        nextAction: !record?.check_in_at ? "check_in" : !record.check_out_at ? "check_out" : "complete",
        canCheckIn: !managementRoles.includes(session.role),
      },
      { headers },
    );
  } catch (cause) {
    console.error("[v2/attendance] failed to load today's attendance", cause);
    return NextResponse.json({ apiVersion: "2", error: "Unable to load attendance" }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "check_out" ? "check_out" : "check_in";
  try {
    const result = await registerAttendance(session, action, String(body.notes ?? ""));
    const lifecycleStatus = action === "check_in" ? "waiting_for_approval" : "completed";
    return NextResponse.json(
      {
        apiVersion: "2",
        ...result,
        record: result.record ? { ...result.record, lifecycleStatus } : null,
        lifecycleStatus,
      },
      { headers },
    );
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "ATTENDANCE_FAILED";
    const messages: Record<string, string> = {
      STAFF_PROFILE_REQUIRED: "Your account is not linked to an active staff assignment. Contact a manager.",
      MANAGERIAL_ROLE_CHECK_IN_FORBIDDEN: "Managerial roles do not check in as staff. Use the managerial attendance controls instead.",
      ALREADY_CHECKED_IN: "You already have an attendance session for the current scheduled day.",
      CHECK_IN_REQUIRED: "Check in before checking out.",
      CHECKOUT_TOO_EARLY: "Check-out is only available at or after your scheduled end time.",
      ALREADY_CHECKED_OUT: "Attendance is already completed for today.",
    };
    const isKnownRule = code in messages || code.startsWith("CHECKOUT_TOO_EARLY:");
    if (!isKnownRule) {
      console.error("[v2/attendance] unexpected attendance registration failure", cause);
    }
    const errorMessage = code.startsWith("CHECKOUT_TOO_EARLY:")
      ? `Check-out is only available at or after your scheduled end time (${code.split(":")[1]}).`
      : messages[code] ?? "Unable to update attendance";
    return NextResponse.json({ apiVersion: "2", error: errorMessage, code }, { status: isKnownRule ? 409 : 500, headers });
  }
}

/** The legacy /api/attendance endpoint remains available for existing consumers. */
export function OPTIONS() {
  return NextResponse.json({ apiVersion: "2", status: "ok" }, { headers });
}
