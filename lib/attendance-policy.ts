import type { AttendanceIdentity } from "@/lib/attendance-identity";

export type AttendanceErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_ATTENDANCE_ELIGIBLE"
  | "SHIFT_NOT_ASSIGNED"
  | "ALREADY_CHECKED_IN"
  | "ALREADY_CHECKED_OUT"
  | "SERVER_ERROR";

export function attendanceErrorMessage(code: AttendanceErrorCode) {
  return {
    UNAUTHENTICATED: "Sign in to use the staff attendance register.",
    NOT_ATTENDANCE_ELIGIBLE: "This account does not use the staff attendance register.",
    SHIFT_NOT_ASSIGNED: "No active shift is assigned for today. Ask a manager to assign your shift before checking in.",
    ALREADY_CHECKED_IN: "You are already checked in and waiting for approval.",
    ALREADY_CHECKED_OUT: "Attendance is already completed for today.",
    SERVER_ERROR: "Unable to update attendance right now.",
  }[code];
}

export function attendanceIdentityPayload(identity: AttendanceIdentity) {
  return {
    userId: identity.userId,
    staffProfileId: identity.staffProfileId,
    role: identity.role,
    classification: identity.classification,
    displayName: identity.displayName,
    canCheckIn: identity.canCheckIn,
  };
}

export function isApprovedAttendanceStatus(status?: string | null) {
  return status === "verified" || status === "late";
}

export function isValidAttendanceDecision(status: string): status is "verified" | "late" | "rejected" {
  return status === "verified" || status === "late" || status === "rejected";
}

export function attendanceDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra" }).format(date);
}

export const ATTENDANCE_API_SUNSET = "Wed, 30 Jun 2027 23:59:59 GMT";

export function withAttendanceDeprecation(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Deprecation", "true");
  headers.set("Sunset", ATTENDANCE_API_SUNSET);
  headers.set("Link", '</api/v1/attendance>; rel="successor-version"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function normalizeAttendanceError(error: unknown): AttendanceErrorCode {
  const code = error instanceof Error ? error.message : "SERVER_ERROR";
  return ["UNAUTHENTICATED", "NOT_ATTENDANCE_ELIGIBLE", "SHIFT_NOT_ASSIGNED", "ALREADY_CHECKED_IN", "ALREADY_CHECKED_OUT"].includes(code)
    ? (code as AttendanceErrorCode)
    : "SERVER_ERROR";
}

export function assertAttendanceIdentity(identity: AttendanceIdentity) {
  if (!identity.canCheckIn) throw new Error("NOT_ATTENDANCE_ELIGIBLE");
}

export function identityIsActive(identity: AttendanceIdentity) {
  return Boolean(identity.userId);
}

export type AttendanceIdentityContract = ReturnType<typeof attendanceIdentityPayload>;

export function identityMatchesCanonicalUser(identity: AttendanceIdentity, staffId: string) {
  return identity.userId === staffId;
}

export function policyVersion() {
  return "attendance-policy-v1" as const;
}

export function isAttendanceIdentity(value: unknown): value is AttendanceIdentity {
  return Boolean(value && typeof value === "object" && "userId" in value && "canCheckIn" in value);
}
