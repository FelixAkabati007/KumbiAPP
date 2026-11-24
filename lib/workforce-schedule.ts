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
  if (norm === "other" || norm.includes("other")) return "Other";
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

let workforceTablesEnsuredPromise: Promise<void> | null = null;

/**
 * Idempotently ensures all workforce tables and columns exist in PostgreSQL.
 * Resolves missing table errors (such as staff_schedule_assignments) and missing columns (updated_at).
 */
export async function ensureWorkforceScheduleTables(
  executor: (text: string, params?: unknown[]) => Promise<unknown> = query,
): Promise<void> {
  if (!workforceTablesEnsuredPromise) {
    workforceTablesEnsuredPromise = (async () => {
      try {
        await executor(`
          CREATE TABLE IF NOT EXISTS work_schedules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(120) NOT NULL,
            job_classification VARCHAR(100) NOT NULL,
            department VARCHAR(100),
            shift_period VARCHAR(20) NOT NULL DEFAULT 'standard',
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            reminder_minutes INTEGER NOT NULL DEFAULT 20,
            timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `).catch(() => undefined);

        await executor(`ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP`).catch(() => undefined);
        await executor(`ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`).catch(() => undefined);
        await executor(`ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS shift_period VARCHAR(20) NOT NULL DEFAULT 'standard'`).catch(() => undefined);
        await executor(`ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER NOT NULL DEFAULT 20`).catch(() => undefined);
        await executor(`ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra'`).catch(() => undefined);

        await executor(`
          CREATE TABLE IF NOT EXISTS staff_schedule_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            staff_id UUID NOT NULL,
            schedule_id UUID NOT NULL,
            work_date DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `).catch(() => undefined);

        await executor(`CREATE INDEX IF NOT EXISTS idx_work_schedules_classification ON work_schedules(job_classification, is_active)`).catch(() => undefined);
        await executor(`CREATE INDEX IF NOT EXISTS idx_work_schedules_department ON work_schedules(department, is_active)`).catch(() => undefined);
        await executor(`CREATE INDEX IF NOT EXISTS idx_staff_schedule_assignments_date ON staff_schedule_assignments(work_date, status)`).catch(() => undefined);
      } catch (err) {
        console.warn("[workforce-schedule] DDL initialization warning:", err);
      }
    })();
  }
  return workforceTablesEnsuredPromise;
}

/**
 * Idempotently seeds default workforce schedules in PostgreSQL work_schedules table
 * so they appear in Settings -> Staff time schedules and are immediately active.
 */
export async function ensureDefaultWorkSchedules(
  executor: (text: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> = query,
): Promise<void> {
  try {
    await ensureWorkforceScheduleTables(executor as unknown as (text: string, params?: unknown[]) => Promise<unknown>).catch(() => undefined);
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
  // Ensure tables and columns exist in Postgres
  await ensureWorkforceScheduleTables(executor as unknown as (text: string, params?: unknown[]) => Promise<unknown>).catch(() => undefined);

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

  // 2. Daily individual staff assignment (isolated lookup, never blocks general schedules if table doesn't exist)
  const effectiveStaffId = staffId || userIdOrStaffId;
  if (effectiveStaffId) {
    try {
      const assignRes = await executor(
        `SELECT
           s.id AS schedule_id,
           COALESCE(s.name, 'Assigned Shift') AS schedule_name,
           COALESCE(s.job_classification, $3) AS job_classification,
           COALESCE(s.department, $4) AS department,
           COALESCE(s.shift_period, 'standard') AS shift_period,
           s.start_time::text AS start_time,
           s.end_time::text AS end_time,
           COALESCE(s.reminder_minutes, 20) AS reminder_minutes,
           a.status AS assignment_status
         FROM staff_schedule_assignments a
         JOIN work_schedules s ON s.id = a.schedule_id
         WHERE a.staff_id::text = $1::text
           AND a.work_date = ${propertyDayExpression("$2::timestamptz")}
           AND a.status <> 'cancelled'
           AND s.is_active = true
         LIMIT 1`,
        [effectiveStaffId, tsParam, canonicalClassification, department],
      );
      const assignRow = assignRes.rows?.[0];
      if (assignRow?.start_time && assignRow?.end_time) {
        const startTimeFormatted = String(assignRow.start_time).slice(0, 5);
        const endTimeFormatted = String(assignRow.end_time).slice(0, 5);
        return {
          scheduleId: assignRow.schedule_id,
          schedule_name: assignRow.schedule_name || `${canonicalClassification} assigned`,
          job_classification: assignRow.job_classification || canonicalClassification,
          department: assignRow.department || department,
          shift_period: assignRow.shift_period || "standard",
          start_time: startTimeFormatted,
          end_time: endTimeFormatted,
          reminder_minutes: Number(assignRow.reminder_minutes) || 20,
          assignment_status: assignRow.assignment_status || "assigned",
          startTime: startTimeFormatted,
          endTime: endTimeFormatted,
          reminderMinutes: Number(assignRow.reminder_minutes) || 20,
        };
      }
    } catch (err) {
      console.warn("[workforce-schedule] Daily assignment check skipped:", err);
    }
  }

  // 3. Query work_schedules directly (WITHOUT mandatory join on staff_schedule_assignments)
  // Matches specific role/classification first, then department-wide fallback
  const scheduleQueryParams = [effectiveStaffId, tsParam, role, canonicalClassification, department, rawClassification];

  const buildScheduleQuery = (includeUpdatedAt: boolean) => `
    SELECT
      s.id AS schedule_id,
      COALESCE(s.name, CONCAT($4, ' standard')) AS schedule_name,
      COALESCE(s.job_classification, $4) AS job_classification,
      COALESCE(s.department, $5) AS department,
      COALESCE(s.shift_period, 'standard') AS shift_period,
      s.start_time::text AS start_time,
      s.end_time::text AS end_time,
      COALESCE(s.reminder_minutes, 20) AS reminder_minutes,
      'default' AS assignment_status
    FROM work_schedules s
    WHERE COALESCE(s.is_active, true) = true
    ORDER BY
      -- Match relevance score:
      CASE
        -- 1. Exact role / classification match (exact, trimmed, or alphanumeric normalized)
        WHEN LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($4, '[^a-z0-9]', '', 'g')) THEN 100
        WHEN LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($3, '[^a-z0-9]', '', 'g')) THEN 100
        WHEN LOWER(TRIM(s.job_classification)) = LOWER(TRIM($6)) THEN 100
        WHEN LOWER(REGEXP_REPLACE(s.job_classification, '[^a-z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE($6, '[^a-z0-9]', '', 'g')) THEN 100
        -- 2. Flexible role keyword match
        WHEN LOWER(s.job_classification) LIKE CONCAT('%', LOWER(TRIM($4)), '%') THEN 90
        WHEN (
          (LOWER($3) = 'waiterwaitress' OR LOWER($4) = 'waiter/waitress' OR LOWER($6) LIKE '%waiter%' OR LOWER($6) LIKE '%waitress%' OR LOWER($6) LIKE '%server%')
          AND (
            LOWER(s.job_classification) LIKE '%waiter%'
            OR LOWER(s.job_classification) LIKE '%waitress%'
            OR LOWER(s.job_classification) LIKE '%server%'
            OR LOWER(s.name) LIKE '%waiter%'
            OR LOWER(s.name) LIKE '%waitress%'
            OR LOWER(s.name) LIKE '%server%'
          )
        ) THEN 90
        WHEN (
          (LOWER($3) IN ('kitchen', 'chef') OR LOWER($4) = 'chef' OR LOWER($6) LIKE '%chef%' OR LOWER($6) LIKE '%cook%' OR LOWER($6) LIKE '%kitchen%')
          AND (
            LOWER(s.job_classification) LIKE '%chef%'
            OR LOWER(s.job_classification) LIKE '%kitchen%'
            OR LOWER(s.job_classification) LIKE '%cook%'
            OR LOWER(s.name) LIKE '%chef%'
            OR LOWER(s.name) LIKE '%kitchen%'
          )
        ) THEN 90
        WHEN (
          (LOWER($3) IN ('frontdesk', 'reception') OR LOWER($4) = 'reception' OR LOWER($6) LIKE '%reception%' OR LOWER($6) LIKE '%front desk%' OR LOWER($6) LIKE '%frontdesk%')
          AND (
            LOWER(s.job_classification) LIKE '%reception%'
            OR LOWER(s.job_classification) LIKE '%front desk%'
            OR LOWER(s.job_classification) LIKE '%frontdesk%'
            OR LOWER(s.name) LIKE '%reception%'
            OR LOWER(s.name) LIKE '%front desk%'
          )
        ) THEN 90
        WHEN (
          (LOWER($3) = 'restaurantfrontdesk' OR LOWER($4) = 'restaurant front desk / pos' OR LOWER($6) LIKE '%pos%' OR LOWER($6) LIKE '%cashier%')
          AND (
            LOWER(s.job_classification) LIKE '%pos%'
            OR LOWER(s.job_classification) LIKE '%cashier%'
            OR LOWER(s.job_classification) LIKE '%restaurant front desk%'
            OR LOWER(s.name) LIKE '%pos%'
            OR LOWER(s.name) LIKE '%cashier%'
          )
        ) THEN 90
        WHEN (
          (LOWER($3) = 'housekeeping' OR LOWER($4) = 'housekeeping' OR LOWER($6) LIKE '%housekeep%' OR LOWER($6) LIKE '%clean%')
          AND (
            LOWER(s.job_classification) LIKE '%housekeep%'
            OR LOWER(s.job_classification) LIKE '%clean%'
            OR LOWER(s.job_classification) LIKE '%laundry%'
            OR LOWER(s.name) LIKE '%housekeep%'
            OR LOWER(s.name) LIKE '%clean%'
          )
        ) THEN 90
        WHEN (
          (LOWER($4) = 'security' OR LOWER($6) LIKE '%secur%' OR LOWER($6) LIKE '%guard%')
          AND (LOWER(s.job_classification) LIKE '%secur%' OR LOWER(s.job_classification) LIKE '%guard%' OR LOWER(s.name) LIKE '%secur%')
        ) THEN 90
        WHEN (
          (LOWER($4) = 'labour' OR LOWER($6) LIKE '%labour%' OR LOWER($6) LIKE '%labor%' OR LOWER($6) LIKE '%maint%')
          AND (LOWER(s.job_classification) LIKE '%labour%' OR LOWER(s.job_classification) LIKE '%labor%' OR LOWER(s.job_classification) LIKE '%maint%' OR LOWER(s.name) LIKE '%labour%' OR LOWER(s.name) LIKE '%maint%')
        ) THEN 90
        WHEN (
          (LOWER($3) = 'other' OR LOWER($4) = 'other' OR LOWER($6) = 'other')
          AND (LOWER(s.job_classification) = 'other' OR LOWER(s.name) LIKE '%other%')
        ) THEN 90
        -- 3. Department match
        WHEN LOWER(TRIM(s.department)) = LOWER(TRIM($5)) THEN 70
        WHEN LOWER(TRIM(s.department)) LIKE CONCAT('%', LOWER(TRIM($5)), '%') THEN 60
        WHEN LOWER(TRIM($5)) LIKE CONCAT('%', LOWER(TRIM(s.department)), '%') THEN 60
        -- 4. General "Other" / "Staff" schedule configured by Admin
        WHEN LOWER(s.job_classification) = 'other' OR LOWER(s.job_classification) = 'staff' THEN 50
        -- 5. Any active schedule in work_schedules
        ELSE 10
      END DESC,
      -- Department tie-break:
      CASE
        WHEN LOWER(TRIM(s.department)) = LOWER(TRIM($5)) THEN 0
        WHEN LOWER(TRIM(s.department)) LIKE CONCAT('%', LOWER(TRIM($5)), '%') THEN 1
        WHEN LOWER(TRIM($5)) LIKE CONCAT('%', LOWER(TRIM(s.department)), '%') THEN 1
        ELSE 2
      END,
      ${includeUpdatedAt ? "COALESCE(s.updated_at, s.created_at) DESC, s.created_at DESC" : "s.created_at DESC"}
    LIMIT 1
  `;

  const scheduleRes = await executor(buildScheduleQuery(true), scheduleQueryParams).catch(async (err) => {
    console.warn("[workforce-schedule] Schedule lookup with updated_at failed, attempting fallback query:", err);
    return executor(buildScheduleQuery(false), scheduleQueryParams).catch((err2) => {
      console.error("[workforce-schedule] General schedule query failed:", err2);
      return { rows: [] };
    });
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
