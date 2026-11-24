import { query } from "@/lib/db";
import type { UserRole } from "@/lib/roles";
import { managementRoles } from "@/lib/roles";
import { propertyDayExpression } from "@/lib/operational-day";

export interface WorkforceSchedule {
  scheduleId?: string;
  schedule_name: string;
  job_classification: string;
  department: string;
  shift_period: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  reminder_minutes: number;
  assignment_status: string;
  work_date?: string;
  // CamelCase accessors for ergonomic use
  startTime: string;
  endTime: string;
  reminderMinutes: number;
}

export interface DefaultScheduleSpec {
  name: string;
  jobClassification: string;
  department: "Hotel" | "Restaurant" | "Operations";
  shiftPeriod: string;
  startTime: string;
  endTime: string;
  reminderMinutes: number;
}

export const DEFAULT_WORKFORCE_SCHEDULES: readonly DefaultScheduleSpec[] = [
  {
    name: "Hotel Reception Shift",
    jobClassification: "Reception",
    department: "Hotel",
    shiftPeriod: "standard",
    startTime: "07:00",
    endTime: "19:00",
    reminderMinutes: 20,
  },
  {
    name: "Restaurant Front Desk / POS",
    jobClassification: "Restaurant Front Desk / POS",
    department: "Restaurant",
    shiftPeriod: "standard",
    startTime: "08:00",
    endTime: "21:00",
    reminderMinutes: 20,
  },
  {
    name: "Kitchen Chef Shift",
    jobClassification: "Chef",
    department: "Restaurant",
    shiftPeriod: "standard",
    startTime: "07:30",
    endTime: "21:30",
    reminderMinutes: 20,
  },
  {
    name: "Waiter/Waitress Shift",
    jobClassification: "Waiter/Waitress",
    department: "Restaurant",
    shiftPeriod: "standard",
    startTime: "08:00",
    endTime: "21:00",
    reminderMinutes: 20,
  },
  {
    name: "Housekeeping Shift",
    jobClassification: "Housekeeping",
    department: "Hotel",
    shiftPeriod: "standard",
    startTime: "08:00",
    endTime: "17:00",
    reminderMinutes: 20,
  },
  {
    name: "Service Staff Shift",
    jobClassification: "Staff",
    department: "Restaurant",
    shiftPeriod: "standard",
    startTime: "08:00",
    endTime: "17:00",
    reminderMinutes: 20,
  },
  {
    name: "Security Shift",
    jobClassification: "Security",
    department: "Operations",
    shiftPeriod: "standard",
    startTime: "06:00",
    endTime: "18:00",
    reminderMinutes: 20,
  },
  {
    name: "Labour & Maintenance Shift",
    jobClassification: "Labour",
    department: "Operations",
    shiftPeriod: "standard",
    startTime: "08:00",
    endTime: "17:00",
    reminderMinutes: 20,
  },
];

export const VALID_SCHEDULE_CLASSIFICATIONS = [
  "Reception",
  "Restaurant Front Desk / POS",
  "Waiter/Waitress",
  "Chef",
  "Housekeeping",
  "Security",
  "Labour",
  "Staff",
  "Operations",
  "Accounts/Finance",
  "Management",
  "Other",
] as const;

export const VALID_SCHEDULE_DEPARTMENTS = [
  "Hotel",
  "Restaurant",
  "Operations",
  "Hotel & Restaurant",
  "Hotel Operations",
] as const;

/**
 * Normalizes any role or classification string to the canonical schedule classification.
 */
export function normalizeScheduleClassification(roleOrClassification?: string | null): string {
  if (!roleOrClassification) return "Staff";
  const norm = roleOrClassification.trim().toLowerCase();
  if (norm === "restaurantfrontdesk" || norm === "restaurantpos" || norm.includes("restaurant front") || norm.includes("pos") || norm.includes("cashier")) return "Restaurant Front Desk / POS";
  if (norm === "kitchen" || norm === "chef" || norm.includes("cook") || norm.includes("kitchen") || norm.includes("chef")) return "Chef";
  if (norm === "frontdesk" || norm === "reception" || norm.includes("front desk") || norm.includes("frontdesk") || norm.includes("reception")) return "Reception";
  if (norm === "waiterwaitress" || norm.includes("waiter") || norm.includes("waitress") || norm.includes("server")) return "Waiter/Waitress";
  if (norm.includes("housekeep") || norm.includes("clean") || norm.includes("maid") || norm.includes("laundry")) return "Housekeeping";
  if (norm.includes("secur") || norm.includes("guard") || norm.includes("watchman")) return "Security";
  if (norm.includes("labour") || norm.includes("labor") || norm.includes("maint") || norm.includes("janitor") || norm.includes("handyman")) return "Labour";
  if (norm.includes("operat")) return "Operations";
  if (norm.includes("financ") || norm.includes("account")) return "Accounts/Finance";
  if (norm.includes("manage")) return "Management";
  return "Staff";
}

/**
 * Idempotently seeds default workforce schedules in PostgreSQL work_schedules table
 * so they appear in Settings -> Staff time schedules and are immediately active.
 */
export async function ensureDefaultWorkSchedules(
  executor: (text: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> = query,
): Promise<void> {
  try {
    for (const s of DEFAULT_WORKFORCE_SCHEDULES) {
      await executor(
        `INSERT INTO work_schedules (name, job_classification, department, shift_period, start_time, end_time, reminder_minutes, timezone, is_active)
         SELECT $1, $2, $3, $4, $5::time, $6::time, $7, 'Africa/Accra', true
         WHERE NOT EXISTS (
           SELECT 1 FROM work_schedules
           WHERE LOWER(REGEXP_REPLACE(job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($2, '[^a-z0-9]', '', 'g'))
             AND (
               LOWER(TRIM(department)) = LOWER(TRIM($3))
               OR LOWER(TRIM(department)) LIKE CONCAT('%', LOWER(TRIM($3)), '%')
               OR LOWER(TRIM($3)) LIKE CONCAT('%', LOWER(TRIM(department)), '%')
             )
         )`,
        [s.name, s.jobClassification, s.department, s.shiftPeriod, s.startTime, s.endTime, s.reminderMinutes],
      ).catch(() => undefined);
    }
  } catch (err) {
    console.warn("[workforce-schedule] Non-fatal default schedule ensure warning:", err);
  }
}

export interface WorkforceDbRow {
  schedule_id?: string;
  schedule_name?: string;
  job_classification?: string;
  department?: string;
  shift_period?: string;
  start_time?: string;
  end_time?: string;
  reminder_minutes?: number;
  assignment_status?: string;
  user_id?: string;
  user_role?: string;
  user_name?: string;
  user_email?: string;
  staff_id?: string;
  position?: string;
  id?: string;
}

export type WorkforceQueryExecutor = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: WorkforceDbRow[]; rowCount?: number | null }>;

/**
 * Resolves the effective authoritative work schedule for any staff user, adhering strictly
 * to the rules in Staff time schedules configured in the settings area.
 */
export async function resolveWorkforceSchedule(
  userIdOrStaffId: string,
  referenceTimestamp?: string | Date,
  executor: WorkforceQueryExecutor = query as unknown as WorkforceQueryExecutor,
  fallbackRole?: string,
  fallbackDepartment?: string,
): Promise<WorkforceSchedule> {
  const tsParam = referenceTimestamp
    ? typeof referenceTimestamp === "string"
      ? referenceTimestamp
      : referenceTimestamp.toISOString()
    : new Date().toISOString();

  // 1. Resolve staff profile & user info
  const profileRes = await executor(
    `SELECT u.id AS user_id, u.role AS user_role, u.name AS user_name, u.email AS user_email,
            sp.id AS staff_id, sp.position, sp.job_classification, sp.department
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE u.id::text = $1::text OR sp.id::text = $1::text
     ORDER BY CASE WHEN u.id::text = $1::text THEN 0 ELSE 1 END
     LIMIT 1`,
    [userIdOrStaffId],
  ).catch((err) => {
    console.warn("[workforce-schedule] Profile lookup warning:", err);
    return { rows: [] };
  });

  const user = profileRes.rows[0];
  const role: UserRole = (user?.user_role as UserRole) || (fallbackRole as UserRole) || "staff";
  const rawClassification = user?.job_classification || user?.position || fallbackRole || role;
  const canonicalClassification = normalizeScheduleClassification(rawClassification);
  const department = user?.department || fallbackDepartment || (canonicalClassification === "Reception" || canonicalClassification === "Housekeeping" ? "Hotel" : "Restaurant");

  // If staff profile is missing in DB for this user, attempt to provision it
  let staffId = user?.staff_id;
  if (!staffId && user?.user_id) {
    try {
      const ins = await executor(
        `INSERT INTO staff_profiles (user_id, first_name, last_name, business_email, department, position, job_classification, password_hash, is_active)
         VALUES ($1, $2, 'Staff', $3, $4, $5, $6, 'managed', true)
         ON CONFLICT (user_id) DO UPDATE SET is_active = true
         RETURNING id`,
        [user.user_id, user.user_name || "Staff", user.user_email || `staff-${user.user_id.slice(0, 8)}@kumbisaly.com`, department, canonicalClassification, canonicalClassification],
      );
      staffId = ins.rows[0]?.id;
    } catch {
      // Non-fatal if read-only or mocked
    }
  }

  // 2. Query work_schedules:
  // Check individual assignment first, then match specific role or departmental schedule defined in Settings -> Staff time schedules
  const scheduleRes = await executor(
    `SELECT
       s.id AS schedule_id,
       COALESCE(s.name, CONCAT($4, ' standard')) AS schedule_name,
       COALESCE(s.job_classification, $4) AS job_classification,
       COALESCE(s.department, $5) AS department,
       COALESCE(s.shift_period, 'standard') AS shift_period,
       s.start_time::text AS start_time,
       s.end_time::text AS end_time,
       COALESCE(s.reminder_minutes, 20) AS reminder_minutes,
       COALESCE(a.status, 'default') AS assignment_status
     FROM work_schedules s
     LEFT JOIN staff_schedule_assignments a
       ON a.schedule_id = s.id
      AND a.staff_id::text = $1::text
      AND a.work_date = ${propertyDayExpression("$2::timestamptz")}
      AND a.status <> 'cancelled'
     WHERE s.is_active = true
       AND (
         -- 1. Daily individual assignment
         a.id IS NOT NULL
         -- 2. Specific role / classification match (exact or flexible)
         OR LOWER(TRIM(s.job_classification)) = LOWER(TRIM($4))
         OR LOWER(TRIM(s.job_classification)) = LOWER(TRIM($3))
         OR LOWER(TRIM(s.job_classification)) = LOWER(TRIM($6))
         OR LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($4, '[^a-z0-9]', '', 'g'))
         OR LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($3, '[^a-z0-9]', '', 'g'))
         OR LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($6, '[^a-z0-9]', '', 'g'))
         OR (
           (LOWER($3) = 'waiterwaitress' OR LOWER($4) = 'waiter/waitress' OR LOWER($6) LIKE '%waiter%' OR LOWER($6) LIKE '%waitress%' OR LOWER($6) LIKE '%server%')
           AND (
             LOWER(s.job_classification) LIKE '%waiter%'
             OR LOWER(s.job_classification) LIKE '%waitress%'
             OR LOWER(s.job_classification) LIKE '%server%'
             OR LOWER(s.name) LIKE '%waiter%'
             OR LOWER(s.name) LIKE '%waitress%'
             OR LOWER(s.name) LIKE '%server%'
           )
         )
         OR (
           (LOWER($3) IN ('kitchen', 'chef') OR LOWER($4) = 'chef' OR LOWER($6) LIKE '%chef%' OR LOWER($6) LIKE '%cook%' OR LOWER($6) LIKE '%kitchen%')
           AND (
             LOWER(s.job_classification) LIKE '%chef%'
             OR LOWER(s.job_classification) LIKE '%kitchen%'
             OR LOWER(s.job_classification) LIKE '%cook%'
             OR LOWER(s.name) LIKE '%chef%'
             OR LOWER(s.name) LIKE '%kitchen%'
           )
         )
         OR (
           (LOWER($3) IN ('frontdesk', 'reception') OR LOWER($4) = 'reception' OR LOWER($6) LIKE '%reception%' OR LOWER($6) LIKE '%front desk%' OR LOWER($6) LIKE '%frontdesk%')
           AND (
             LOWER(s.job_classification) LIKE '%reception%'
             OR LOWER(s.job_classification) LIKE '%front desk%'
             OR LOWER(s.job_classification) LIKE '%frontdesk%'
             OR LOWER(s.name) LIKE '%reception%'
             OR LOWER(s.name) LIKE '%front desk%'
           )
         )
         OR (
           (LOWER($3) = 'restaurantfrontdesk' OR LOWER($4) = 'restaurant front desk / pos' OR LOWER($6) LIKE '%pos%' OR LOWER($6) LIKE '%cashier%')
           AND (
             LOWER(s.job_classification) LIKE '%pos%'
             OR LOWER(s.job_classification) LIKE '%cashier%'
             OR LOWER(s.job_classification) LIKE '%restaurant front desk%'
             OR LOWER(s.name) LIKE '%pos%'
             OR LOWER(s.name) LIKE '%cashier%'
           )
         )
         OR (
           (LOWER($3) = 'housekeeping' OR LOWER($4) = 'housekeeping' OR LOWER($6) LIKE '%housekeep%' OR LOWER($6) LIKE '%clean%')
           AND (
             LOWER(s.job_classification) LIKE '%housekeep%'
             OR LOWER(s.job_classification) LIKE '%clean%'
             OR LOWER(s.job_classification) LIKE '%laundry%'
             OR LOWER(s.name) LIKE '%housekeep%'
             OR LOWER(s.name) LIKE '%clean%'
           )
         )
         OR (
           (LOWER($4) = 'security' OR LOWER($6) LIKE '%secur%' OR LOWER($6) LIKE '%guard%')
           AND (
             LOWER(s.job_classification) LIKE '%secur%'
             OR LOWER(s.job_classification) LIKE '%guard%'
             OR LOWER(s.name) LIKE '%secur%'
           )
         )
         OR (
           (LOWER($4) = 'labour' OR LOWER($6) LIKE '%labour%' OR LOWER($6) LIKE '%labor%' OR LOWER($6) LIKE '%maint%')
           AND (
             LOWER(s.job_classification) LIKE '%labour%'
             OR LOWER(s.job_classification) LIKE '%labor%'
             OR LOWER(s.job_classification) LIKE '%maint%'
             OR LOWER(s.name) LIKE '%labour%'
             OR LOWER(s.name) LIKE '%maint%'
           )
         )
         OR (
           (LOWER($3) = 'staff' OR LOWER($4) = 'staff' OR LOWER($6) LIKE '%staff%')
           AND (
             LOWER(s.job_classification) LIKE '%staff%'
             OR LOWER(s.name) LIKE '%staff%'
           )
         )
         -- 3. Department-wide schedule fallback:
         OR (
           LOWER(TRIM(s.department)) = LOWER(TRIM($5))
           OR LOWER(TRIM(s.department)) LIKE CONCAT('%', LOWER(TRIM($5)), '%')
           OR LOWER(TRIM($5)) LIKE CONCAT('%', LOWER(TRIM(s.department)), '%')
         )
       )
     ORDER BY
       CASE WHEN a.id IS NOT NULL THEN 0 ELSE 1 END,
       -- Role match ranking:
       CASE
         WHEN LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($4, '[^a-z0-9]', '', 'g')) THEN 0
         WHEN LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($3, '[^a-z0-9]', '', 'g')) THEN 0
         WHEN LOWER(TRIM(s.job_classification)) = LOWER(TRIM($6)) THEN 0
         WHEN LOWER(s.job_classification) LIKE CONCAT('%', LOWER(TRIM($4)), '%') THEN 1
         WHEN (
           (LOWER($3) = 'waiterwaitress' OR LOWER($4) = 'waiter/waitress')
           AND (LOWER(s.job_classification) LIKE '%waiter%' OR LOWER(s.job_classification) LIKE '%waitress%' OR LOWER(s.name) LIKE '%waiter%' OR LOWER(s.name) LIKE '%waitress%')
         ) THEN 1
         WHEN (
           (LOWER($3) IN ('kitchen', 'chef') OR LOWER($4) = 'chef')
           AND (LOWER(s.job_classification) LIKE '%chef%' OR LOWER(s.job_classification) LIKE '%cook%' OR LOWER(s.name) LIKE '%chef%')
         ) THEN 1
         WHEN (
           (LOWER($3) IN ('frontdesk', 'reception') OR LOWER($4) = 'reception')
           AND (LOWER(s.job_classification) LIKE '%reception%' OR LOWER(s.job_classification) LIKE '%front desk%' OR LOWER(s.name) LIKE '%reception%')
         ) THEN 1
         ELSE 2
       END,
       -- Department match ranking:
       CASE
         WHEN LOWER(TRIM(s.department)) = LOWER(TRIM($5)) THEN 0
         WHEN LOWER(TRIM(s.department)) LIKE CONCAT('%', LOWER(TRIM($5)), '%') THEN 1
         WHEN LOWER(TRIM($5)) LIKE CONCAT('%', LOWER(TRIM(s.department)), '%') THEN 1
         ELSE 2
       END,
       COALESCE(s.updated_at, s.created_at) DESC,
       s.created_at DESC
     LIMIT 1`,
    [staffId || userIdOrStaffId, tsParam, role, canonicalClassification, department, rawClassification],
  ).catch((err) => {
    console.warn("[workforce-schedule] Schedule lookup warning:", err);
    return { rows: [] };
  });

  const row = scheduleRes.rows[0];

  // 3. If schedule found in database, format and return it
  if (row?.start_time && row?.end_time) {
    const startTimeFormatted = String(row.start_time).slice(0, 5);
    const endTimeFormatted = String(row.end_time).slice(0, 5);
    return {
      scheduleId: row.schedule_id,
      schedule_name: row.schedule_name || `${canonicalClassification} standard`,
      job_classification: row.job_classification || canonicalClassification,
      department: row.department || department,
      shift_period: row.shift_period || "standard",
      start_time: startTimeFormatted,
      end_time: endTimeFormatted,
      reminder_minutes: Number(row.reminder_minutes) || 20,
      assignment_status: row.assignment_status || "default",
      startTime: startTimeFormatted,
      endTime: endTimeFormatted,
      reminderMinutes: Number(row.reminder_minutes) || 20,
    };
  }

  // 4. Default fallback matching DEFAULT_WORKFORCE_SCHEDULES
  const defaultMatch =
    DEFAULT_WORKFORCE_SCHEDULES.find((d) => d.jobClassification.toLowerCase() === canonicalClassification.toLowerCase()) ||
    DEFAULT_WORKFORCE_SCHEDULES.find((d) => d.jobClassification === "Staff") ||
    DEFAULT_WORKFORCE_SCHEDULES[0];

  return {
    schedule_name: `${defaultMatch.jobClassification} standard`,
    job_classification: defaultMatch.jobClassification,
    department: defaultMatch.department,
    shift_period: defaultMatch.shiftPeriod,
    start_time: defaultMatch.startTime,
    end_time: defaultMatch.endTime,
    reminder_minutes: defaultMatch.reminderMinutes,
    assignment_status: "default",
    startTime: defaultMatch.startTime,
    endTime: defaultMatch.endTime,
    reminderMinutes: defaultMatch.reminderMinutes,
  };
}

/**
 * Returns true if the user role is an operational workforce role subject to staff time schedules.
 */
export function isWorkforceRole(role?: string | null): boolean {
  if (!role) return false;
  return !managementRoles.includes(role as UserRole);
}
