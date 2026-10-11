import type { AttendanceIdentity } from "@/lib/attendance-identity";

const EXEMPT_ROLES = new Set(["admin", "administrator", "general_manager", "general manager"]);

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || null;
}

export function evaluateAttendanceEligibility(input: {
  role: string;
  classification: string | null;
  employmentStatus?: string | null;
  isActive?: boolean | null;
}) {
  const role = normalize(input.role) ?? "unknown";
  const classification = normalize(input.classification);
  const inactive = input.isActive === false || ["inactive", "terminated", "suspended"].includes(normalize(input.employmentStatus) ?? "");
  const exempt = EXEMPT_ROLES.has(role) || (role.includes("manager") && !["restaurant_manager", "front_desk_manager"].includes(role));
  const eligibleForStaffAttendance = !inactive && !exempt && Boolean(classification);
  return {
    eligibleForStaffAttendance,
    role,
    classification,
    reason: inactive ? "INACTIVE_EMPLOYMENT" : exempt ? "EXEMPT_ROLE" : !classification ? "MISSING_CLASSIFICATION" : null,
  } as const;
}

export function attendanceEligibility(identity: AttendanceIdentity) {
  return evaluateAttendanceEligibility({
    role: identity.role,
    classification: identity.classification,
    employmentStatus: identity.employmentStatus,
    isActive: identity.isActive,
  });
}
