import { query } from "@/lib/db";
import type { ApiSession } from "@/lib/api-auth";
import { attendanceEligibility } from "@/lib/attendance-policy";

export type AttendanceIdentity = {
  userId: string;
  staffProfileId: string | null;
  role: string;
  classification: string | null;
  displayName: string;
  email: string | null;
  canCheckIn: boolean;
  employmentStatus: string | null;
  isActive: boolean | null;
  eligibilityReason: string | null;
};

export async function resolveAttendanceIdentity(session: ApiSession): Promise<AttendanceIdentity> {
  const result = await query(
    `SELECT u.id AS user_id, u.role::text AS role, u.email,
            COALESCE(NULLIF(NULLIF(TRIM(u.name), ''), 'Staff member'),
              NULLIF(CONCAT_WS(' ', NULLIF(TRIM(sp.first_name), ''), NULLIF(TRIM(sp.last_name), '')), ''),
              NULLIF(TRIM(u.email), ''), u.id::text) AS display_name,
            sp.id AS staff_profile_id,
            COALESCE(sp.job_classification, sp.position) AS classification,
            sp.employment_status,
            sp.is_active
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [session.id],
  );
  const row = result.rows[0];
  const role = String(row?.role ?? session.role);
  const classification = row?.classification ? String(row.classification) : null;
  const employmentStatus = row?.employment_status ? String(row.employment_status) : null;
  const isActive = row?.is_active == null ? null : Boolean(row.is_active);
  const eligibility = attendanceEligibility({ role, classification, employmentStatus, isActive } as AttendanceIdentity);
  return {
    userId: String(row?.user_id ?? session.id),
    staffProfileId: row?.staff_profile_id ? String(row.staff_profile_id) : null,
    role,
    classification,
    displayName: String(row?.display_name ?? session.name ?? session.email ?? session.id),
    email: row?.email ? String(row.email) : session.email ?? null,
    canCheckIn: eligibility.eligibleForStaffAttendance,
    employmentStatus,
    isActive,
    eligibilityReason: eligibility.reason,
  };
}

export function attendanceStaffIds(identity: AttendanceIdentity): string[] {
  return [identity.userId, identity.staffProfileId].filter((value): value is string => Boolean(value));
}
