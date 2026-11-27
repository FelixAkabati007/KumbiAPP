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
  /** "schedule" = Admin rule from work_schedules, "assignment" = daily override, "fallback" = code defaults (nothing matched / DB error). */
  source?: "schedule" | "assignment" | "fallback";
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
  created_at?: string;
  updated_at?: string;
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
         SELECT $1::uuid, $2::varchar, 'Staff', $3::varchar, $4::varchar, $5::varchar, $6::varchar, 'managed', true
         WHERE NOT EXISTS (
           SELECT 1 FROM staff_profiles WHERE user_id = $1::uuid OR LOWER(business_email) = LOWER($7::text)
         )
         RETURNING id`,
        [
          user.user_id,
          user.user_name || "Staff",
          user.user_email || `staff-${user.user_id.slice(0, 8)}@kumbisaly.com`,
          department,
          canonicalClassification,
          canonicalClassification,
          user.user_email || `staff-${user.user_id.slice(0, 8)}@kumbisaly.com`,
        ],
      );
      staffId = ins.rows[0]?.id;
    } catch {
      // Non-fatal if read-only or mocked
    }
  }

  // 2. Daily individual staff assignment (isolated lookup, never blocks general schedules if table doesn't exist)
  let assignRow: WorkforceDbRow | undefined;
  const effectiveStaffId = staffId || userIdOrStaffId;
  if (effectiveStaffId) {
    try {
      const assignRes = await executor(
        `SELECT
           s.id AS schedule_id,
           COALESCE(s.name, 'Assigned Shift') AS schedule_name,
           COALESCE(s.job_classification, $3::text) AS job_classification,
           COALESCE(s.department, $4::text) AS department,
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
      assignRow = assignRes.rows?.[0];
    } catch (err) {
      console.warn("[workforce-schedule] Daily assignment check skipped:", err);
    }
  }

  if (assignRow?.start_time && assignRow?.end_time) {
    return buildScheduleFromAssignment(assignRow, canonicalClassification, department);
  }

  // 3. Load every active rule configured by the Admin in Settings -> Staff management -> Staff time schedules.
  //    IMPORTANT: this statement deliberately has NO bind parameters. The previous implementation passed six
  //    untyped parameters ($1..$6) and used them inside CONCAT()/unused, which makes PostgreSQL (Neon) reject the
  //    statement with `42P18 could not determine data type of parameter $4`. That error was swallowed and the
  //    resolver silently fell back to the hardcoded 08:00-21:00 Waiter/Waitress default. Ranking now happens in
  //    TypeScript (see rankWorkSchedules) where it is unit-testable and cannot trigger a SQL type-inference error.
  const { candidates, lookupError } = await loadActiveWorkSchedules(executor);

  return buildResolvedScheduleFromCandidates(
    { role, canonicalClassification, rawClassification, department },
    candidates,
    lookupError,
  );
}

function buildScheduleFromAssignment(
  assignRow: WorkforceDbRow,
  canonicalClassification: string,
  department: string,
): WorkforceSchedule {
  const startTimeFormatted = String(assignRow.start_time).slice(0, 5);
  const endTimeFormatted = String(assignRow.end_time).slice(0, 5);
  const reminder = Number(assignRow.reminder_minutes) || 20;
  return {
    scheduleId: assignRow.schedule_id,
    schedule_name: assignRow.schedule_name || `${canonicalClassification} assigned`,
    job_classification: assignRow.job_classification || canonicalClassification,
    department: assignRow.department || department,
    shift_period: assignRow.shift_period || "standard",
    start_time: startTimeFormatted,
    end_time: endTimeFormatted,
    reminder_minutes: reminder,
    assignment_status: assignRow.assignment_status || "assigned",
    source: "assignment",
    startTime: startTimeFormatted,
    endTime: endTimeFormatted,
    reminderMinutes: reminder,
  };
}

async function loadActiveWorkSchedules(
  executor: WorkforceQueryExecutor,
): Promise<{ candidates: WorkforceDbRow[] | null; lookupError: unknown }> {
  const scheduleSql = (includeUpdatedAt: boolean) => `
    SELECT
      s.id AS schedule_id,
      s.name AS schedule_name,
      s.job_classification AS job_classification,
      s.department AS department,
      COALESCE(s.shift_period, 'standard') AS shift_period,
      s.start_time::text AS start_time,
      s.end_time::text AS end_time,
      COALESCE(s.reminder_minutes, 20) AS reminder_minutes,
      s.created_at::text AS created_at,
      ${includeUpdatedAt ? "COALESCE(s.updated_at, s.created_at)::text" : "s.created_at::text"} AS updated_at,
      'default' AS assignment_status
    FROM work_schedules s
    WHERE COALESCE(s.is_active, true) = true
  `;

  try {
    const res = await executor(scheduleSql(true));
    return { candidates: res.rows, lookupError: null };
  } catch (err) {
    console.warn("[workforce-schedule] Schedule lookup with updated_at failed, retrying without it:", err);
    try {
      const res2 = await executor(scheduleSql(false));
      return { candidates: res2.rows, lookupError: null };
    } catch (err2) {
      console.error("[workforce-schedule] Schedule lookup FAILED - the hardcoded fallback will be shown:", err2);
      return { candidates: null, lookupError: err2 };
    }
  }
}

function buildResolvedScheduleFromCandidates(
  ctx: ScheduleMatchContext,
  candidates: WorkforceDbRow[] | null,
  lookupError: unknown,
): WorkforceSchedule {
  const row = candidates ? rankWorkSchedules(candidates, ctx)[0] : undefined;

  if (row?.start_time && row?.end_time) {
    const startTimeFormatted = String(row.start_time).slice(0, 5);
    const endTimeFormatted = String(row.end_time).slice(0, 5);
    const reminder = Number(row.reminder_minutes) || 20;
    return {
      scheduleId: row.schedule_id,
      schedule_name: row.schedule_name || `${ctx.canonicalClassification} standard`,
      job_classification: row.job_classification || ctx.canonicalClassification,
      department: row.department || ctx.department,
      shift_period: row.shift_period || "standard",
      start_time: startTimeFormatted,
      end_time: endTimeFormatted,
      reminder_minutes: reminder,
      assignment_status: row.assignment_status || "default",
      source: "schedule",
      startTime: startTimeFormatted,
      endTime: endTimeFormatted,
      reminderMinutes: reminder,
    };
  }

  if (!lookupError) {
    console.warn(
      `[workforce-schedule] No active work_schedules row matches role="${ctx.role}" classification="${ctx.canonicalClassification}" department="${ctx.department}"`,
    );
  }
  const defaultMatch =
    DEFAULT_WORKFORCE_SCHEDULES.find((d) => d.jobClassification.toLowerCase() === ctx.canonicalClassification.toLowerCase()) ||
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
    source: "fallback",
    startTime: defaultMatch.startTime,
    endTime: defaultMatch.endTime,
    reminderMinutes: defaultMatch.reminderMinutes,
  };
}

export interface ResolvedStaffScheduleEntry {
  userId: string;
  staffId?: string;
  role: string;
  schedule: WorkforceSchedule;
}

/**
 * Batch-resolves effective schedules for all active operational workforce staff using the
 * exact same precedence (daily assignment -> ranked Admin work_schedules -> role default)
 * as resolveWorkforceSchedule, in O(1) database round-trips.
 */
export async function resolveWorkforceSchedulesForActiveStaff(
  referenceTimestamp?: string | Date,
  executor: WorkforceQueryExecutor = query as unknown as WorkforceQueryExecutor,
): Promise<ResolvedStaffScheduleEntry[]> {
  await ensureWorkforceScheduleTables(executor as unknown as (text: string, params?: unknown[]) => Promise<unknown>).catch(() => undefined);

  const tsParam = referenceTimestamp
    ? typeof referenceTimestamp === "string"
      ? referenceTimestamp
      : referenceTimestamp.toISOString()
    : new Date().toISOString();

  let staffRows: WorkforceDbRow[] = [];
  try {
    const res = await executor(
      `SELECT
         COALESCE(u.id, sp.user_id)::text AS user_id,
         u.role::text AS user_role,
         sp.id::text AS staff_id,
         sp.position AS position,
         sp.job_classification AS job_classification,
         sp.department AS department
       FROM staff_profiles sp
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id IS NOT NULL
         AND COALESCE(sp.employment_status, 'active') = 'active'
         AND COALESCE(sp.is_active, true) = true
         AND COALESCE(u.is_active, true) = true
       UNION ALL
       SELECT
         u.id::text AS user_id,
         u.role::text AS user_role,
         sp.id::text AS staff_id,
         sp.position AS position,
         sp.job_classification AS job_classification,
         sp.department AS department
       FROM users u
       LEFT JOIN staff_profiles sp ON LOWER(sp.business_email) = LOWER(u.email)
       WHERE COALESCE(u.is_active, true) = true
         AND NOT EXISTS (SELECT 1 FROM staff_profiles sp2 WHERE sp2.user_id = u.id)`,
    );
    staffRows = res.rows ?? [];
  } catch {
    const fallbackRes = await executor(
      `SELECT
         sp.user_id::text AS user_id,
         u.role::text AS user_role,
         sp.id::text AS staff_id,
         sp.position AS position,
         sp.job_classification AS job_classification,
         sp.department AS department
       FROM staff_profiles sp
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id IS NOT NULL`,
    );
    staffRows = fallbackRes.rows ?? [];
  }

  const assignmentsByStaffId = new Map<string, WorkforceDbRow>();
  try {
    const assignRes = await executor(
      `SELECT
         a.staff_id::text AS staff_id,
         s.id AS schedule_id,
         COALESCE(s.name, 'Assigned Shift') AS schedule_name,
         s.job_classification AS job_classification,
         s.department AS department,
         COALESCE(s.shift_period, 'standard') AS shift_period,
         s.start_time::text AS start_time,
         s.end_time::text AS end_time,
         COALESCE(s.reminder_minutes, 20) AS reminder_minutes,
         a.status AS assignment_status
       FROM staff_schedule_assignments a
       JOIN work_schedules s ON s.id = a.schedule_id
       WHERE a.work_date = ${propertyDayExpression("$1::timestamptz")}
         AND a.status <> 'cancelled'
         AND COALESCE(s.is_active, true) = true`,
      [tsParam],
    );
    for (const r of assignRes.rows ?? []) {
      if (r.staff_id && !assignmentsByStaffId.has(r.staff_id)) {
        assignmentsByStaffId.set(r.staff_id, r);
      }
    }
  } catch (err) {
    console.warn("[workforce-schedule] Batch daily assignment lookup skipped:", err);
  }

  const { candidates, lookupError } = await loadActiveWorkSchedules(executor);

  const entries: ResolvedStaffScheduleEntry[] = [];
  const seenUserIds = new Set<string>();

  for (const row of staffRows) {
    const userId = row.user_id;
    if (!userId || seenUserIds.has(userId)) continue;

    const role = (row.user_role as UserRole) || "staff";
    if (role === "admin") continue;

    const rawClassification = row.job_classification || row.position || role;
    const canonicalClassification = normalizeScheduleClassification(rawClassification);
    const department =
      row.department ||
      (canonicalClassification === "Reception" || canonicalClassification === "Housekeeping" ? "Hotel" : "Restaurant");

    const assignRow =
      (row.staff_id ? assignmentsByStaffId.get(row.staff_id) : undefined) || assignmentsByStaffId.get(userId);

    const schedule =
      assignRow?.start_time && assignRow?.end_time
        ? buildScheduleFromAssignment(assignRow, canonicalClassification, department)
        : buildResolvedScheduleFromCandidates(
            { role, canonicalClassification, rawClassification, department },
            candidates,
            lookupError,
          );

    // Operational workforce roles always receive reminders; management roles receive reminders
    // only when Admin explicitly configured a Staff Time Schedule rule or daily assignment for them.
    if (row.user_role && !isWorkforceRole(role) && schedule.source === "fallback") {
      continue;
    }

    seenUserIds.add(userId);
    entries.push({
      userId,
      staffId: row.staff_id,
      role,
      schedule,
    });
  }

  return entries;
}

export function parseTimeToSeconds(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(hhmm ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3] ?? 0);
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

export function getPropertySecondsOfDay(referenceTimestamp?: string | Date, timeZone = "Africa/Accra"): number {
  const date = referenceTimestamp
    ? referenceTimestamp instanceof Date
      ? referenceTimestamp
      : new Date(referenceTimestamp)
    : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}

/**
 * Returns true if `nowSecondsOfDay` falls within the active pre-shift reminder window
 * `[start_time - reminder_minutes, start_time)` (or explicit `windowSeconds`), wrapping cleanly across midnight.
 */
export function isWithinShiftReminderWindow(
  nowSecondsOfDay: number,
  startTimeHHMM: string,
  reminderMinutes: number,
  windowSeconds?: number,
): boolean {
  const startSec = parseTimeToSeconds(startTimeHHMM);
  if (startSec === null) return false;
  const DAY = 86400;
  const reminderSec = Math.max(0, Math.round(reminderMinutes * 60));
  const effectiveWindow =
    typeof windowSeconds === "number"
      ? windowSeconds
      : Math.max(120, reminderSec > 0 ? reminderSec - 1 : 120);
  const triggerSec = (((startSec - reminderSec) % DAY) + DAY) % DAY;
  const elapsed = (((nowSecondsOfDay - triggerSec) % DAY) + DAY) % DAY;
  return elapsed >= 0 && elapsed <= effectiveWindow;
}

function getEffectiveReminderMinutesRemaining(
  nowSecondsOfDay: number,
  startTimeHHMM: string,
  reminderMinutes: number,
): number {
  const startSec = parseTimeToSeconds(startTimeHHMM);
  if (startSec === null) return reminderMinutes;
  const DAY = 86400;
  const reminderSec = Math.max(0, Math.round(reminderMinutes * 60));
  const triggerSec = (((startSec - reminderSec) % DAY) + DAY) % DAY;
  const elapsed = (((nowSecondsOfDay - triggerSec) % DAY) + DAY) % DAY;
  if (elapsed <= 90) {
    return reminderMinutes;
  }
  return Math.max(1, Math.round((reminderSec - elapsed) / 60));
}

export function formatScheduleTime12h(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "").trim());
  if (!match) return hhmm;
  const h24 = Number(match[1]);
  const mins = match[2];
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${mins} ${suffix}`;
}

let lastGlobalReminderSweepMs = 0;
let reminderNotificationsSchemaEnsured = false;
let workforceDefaultAccountsSeeded = false;

/**
 * Throttled background sweep safe to call from high-frequency endpoints (e.g. GET /api/notifications).
 * Evaluates due 20-minute shift reminders for all workforce roles at most once every 60 seconds.
 */
export async function maybeDispatchDueWorkforceReminders(
  referenceTimestamp?: string | Date,
): Promise<void> {
  const nowMs = Date.now();
  if (nowMs - lastGlobalReminderSweepMs < 60_000) {
    return;
  }
  lastGlobalReminderSweepMs = nowMs;
  await dispatchWorkforceShiftReminders({ referenceTimestamp }).catch((err) => {
    console.warn("[workforce-schedule] Background shift reminder sweep warning:", err);
  });
}

/**
 * Evaluates and inserts shift reminders using the canonical schedule resolver
 * (either for a single staff/user ID or for all active workforce staff).
 */
export async function dispatchWorkforceShiftReminders(options?: {
  referenceTimestamp?: string | Date;
  staffOrUserId?: string;
  fallbackRole?: string;
  executor?: WorkforceQueryExecutor;
}): Promise<{ created: number; evaluated: number }> {
  const executor = options?.executor ?? (query as unknown as WorkforceQueryExecutor);
  const isDefaultExecutor = executor === (query as unknown as WorkforceQueryExecutor);
  const tsIso = options?.referenceTimestamp
    ? typeof options.referenceTimestamp === "string"
      ? options.referenceTimestamp
      : options.referenceTimestamp.toISOString()
    : new Date().toISOString();

  if (!isDefaultExecutor || !reminderNotificationsSchemaEnsured) {
    const schemaStatements = [
      `CREATE TABLE IF NOT EXISTS notifications (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         recipient_user_id VARCHAR(255),
         title VARCHAR(255) NOT NULL,
         message TEXT NOT NULL,
         type VARCHAR(100) NOT NULL DEFAULT 'info',
         metadata JSONB DEFAULT '{}'::jsonb,
         read BOOLEAN NOT NULL DEFAULT false,
         read_at TIMESTAMP WITH TIME ZONE,
         opened_at TIMESTAMP WITH TIME ZONE,
         expires_at TIMESTAMP WITH TIME ZONE,
         archived_at TIMESTAMP WITH TIME ZONE,
         archived_reason VARCHAR(255),
         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
       )`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_reason VARCHAR(255)`,
      `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_recipient_user_id_fkey`,
    ];
    for (const stmt of schemaStatements) {
      await executor(stmt).catch(() => undefined);
    }
    if (isDefaultExecutor) {
      reminderNotificationsSchemaEnsured = true;
    }
  }

  // On live Neon DB, ensure canonical default workforce role accounts exist in `users` once per instance
  // so Web Push / background sweeps can deliver reminders even before manual staff creation.
  if (isDefaultExecutor && !options?.staffOrUserId && !workforceDefaultAccountsSeeded) {
    try {
      const { DEFAULT_ROLE_ACCOUNTS } = await import("@/lib/default-accounts");
      for (const acct of DEFAULT_ROLE_ACCOUNTS) {
        if (!isWorkforceRole(acct.role)) continue;
        await executor(
          `INSERT INTO users (id, email, name, role, password_hash, is_active)
           SELECT $1::uuid, $2::varchar, $3::varchar, $4, 'managed', true
           WHERE NOT EXISTS (
             SELECT 1 FROM users WHERE id = $1::uuid OR LOWER(email) = LOWER($5::text)
           )`,
          [acct.id, acct.email, acct.name, acct.role, acct.email],
        ).catch(() => undefined);
      }
      workforceDefaultAccountsSeeded = true;
    } catch {
      // Non-fatal
    }
  }

  let targets: ResolvedStaffScheduleEntry[] = [];
  if (options?.staffOrUserId) {
    const profileRes = await executor(
      `SELECT COALESCE(u.id, sp.user_id)::text AS user_id, u.role::text AS user_role, sp.id::text AS staff_id
       FROM staff_profiles sp
       FULL OUTER JOIN users u ON u.id = sp.user_id
       WHERE u.id::text = $1::text OR sp.id::text = $1::text OR sp.user_id::text = $1::text
       ORDER BY CASE WHEN sp.user_id::text = $1::text THEN 0 WHEN u.id::text = $1::text THEN 1 ELSE 2 END
       LIMIT 1`,
      [options.staffOrUserId],
    ).catch(() => ({ rows: [] as WorkforceDbRow[] }));

    const p = profileRes.rows[0];
    const resolvedUserId = p?.user_id || options.staffOrUserId;
    const role = p?.user_role || options.fallbackRole || "staff";
    if (resolvedUserId && role !== "admin") {
      const schedule = await resolveWorkforceSchedule(resolvedUserId, tsIso, executor, role);
      if (isWorkforceRole(role) || schedule.source !== "fallback") {
        targets = [{ userId: resolvedUserId, staffId: p?.staff_id, role, schedule }];
      }
    }
  } else {
    targets = await resolveWorkforceSchedulesForActiveStaff(tsIso, executor);
  }

  // Exclude staff who have already checked in on this Africa/Accra operational day
  const checkedInIds = new Set<string>();
  if (targets.length > 0) {
    const attRes = await executor(
      `SELECT ar.user_id::text AS user_id, ar.staff_id::text AS staff_id
       FROM attendance_records ar
       WHERE ar.check_in_at IS NOT NULL
         AND ${propertyDayExpression("COALESCE(ar.check_in_at, ar.created_at)")} = ${propertyDayExpression("$1::timestamptz")}`,
      [tsIso],
    ).catch(() => ({ rows: [] as WorkforceDbRow[] }));
    for (const r of attRes.rows) {
      if (r.user_id) checkedInIds.add(String(r.user_id));
      if (r.staff_id) checkedInIds.add(String(r.staff_id));
    }
  }

  const nowSeconds = getPropertySecondsOfDay(tsIso);
  let created = 0;
  const notifiedDeliveries: Array<{ userId: string; id: string; message: string }> = [];

  for (const target of targets) {
    const { schedule, userId, staffId } = target;
    if (checkedInIds.has(userId) || (staffId && checkedInIds.has(staffId))) {
      continue;
    }
    if (!isWithinShiftReminderWindow(nowSeconds, schedule.start_time, schedule.reminder_minutes)) {
      continue;
    }

    const minsRemaining = getEffectiveReminderMinutesRemaining(
      nowSeconds,
      schedule.start_time,
      schedule.reminder_minutes,
    );
    const message = `${schedule.schedule_name} starts in ${minsRemaining} minutes. Reporting time is ${formatScheduleTime12h(schedule.start_time)}.`;
    const ins = await executor(
      `INSERT INTO notifications (recipient_user_id, title, message, type, created_at)
       SELECT $1, 'Shift reminder', $2::text, 'shift_reminder', $4::timestamptz
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.recipient_user_id::text = $3::text
           AND n.type = 'shift_reminder'
           AND ${propertyDayExpression("n.created_at")} = ${propertyDayExpression("$4::timestamptz")}
       )
       RETURNING id::text AS id`,
      [userId, message, userId, tsIso],
    );
    if ((ins.rowCount ?? ins.rows.length) > 0) {
      created += 1;
      const insId = ins.rows[0]?.id ? String(ins.rows[0].id) : undefined;
      if (insId) {
        notifiedDeliveries.push({ userId, id: insId, message });
      }
    }
  }

  if (created > 0 && isDefaultExecutor) {
    try {
      const { dispatchNotificationsRealtimeAndPush } = await import("@/lib/server-notifications");
      for (const item of notifiedDeliveries) {
        await dispatchNotificationsRealtimeAndPush({
          recipientUserIds: [item.userId],
          notificationId: item.id,
          title: "Shift reminder",
          message: item.message,
          type: "shift_reminder",
          url: "/staff",
          tag: `shift-reminder-${item.id}`,
        }).catch(() => undefined);
      }
    } catch {
      const { publishRealtime } = await import("@/lib/realtime");
      await publishRealtime("notifications.updated", "shift_reminder").catch(() => undefined);
    }
  }

  return { created, evaluated: targets.length };
}

const alnum = (value?: string | null) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ScheduleMatchContext {
  role: string;
  canonicalClassification: string;
  rawClassification: string;
  department: string;
}

/**
 * Scores how well an Admin-configured schedule applies to a staff member.
 *   100  exact role/classification (Waiter/Waitress == waiterWaitress == "Waiters/ Waitress" after normalisation)
 *    80  schedule NAME clearly targets the same classification
 *    70  generic (Staff/Other) schedule for the staff member's own department
 *    40  generic (Staff/Other) schedule for any department
 *     0  not applicable (another role's schedule is never borrowed)
 */
export function scoreWorkSchedule(schedule: WorkforceDbRow, ctx: ScheduleMatchContext): number {
  const scheduleClass = String(schedule.job_classification ?? "");
  const scheduleKey = alnum(scheduleClass);
  const ctxKeys = [ctx.canonicalClassification, ctx.rawClassification, ctx.role].map(alnum).filter(Boolean);
  const scheduleCanonical = normalizeScheduleClassification(scheduleClass);

  if (scheduleKey && ctxKeys.includes(scheduleKey)) return 100;
  if (scheduleClass && scheduleCanonical === ctx.canonicalClassification && ctx.canonicalClassification !== "Staff") return 100;

  const nameCanonical = normalizeScheduleClassification(schedule.schedule_name);
  if (nameCanonical !== "Staff" && nameCanonical === ctx.canonicalClassification) return 80;

  const generic = scheduleCanonical === "Staff" || scheduleCanonical === "Other";
  if (generic) {
    const a = alnum(schedule.department);
    const b = alnum(ctx.department);
    if (a && b && (a === b || a.includes(b) || b.includes(a))) return 70;
    return 40;
  }
  return 0;
}

/**
 * Returns the applicable schedules best-first. Ties are broken by department closeness, then the most
 * recently edited rule - so whatever the Admin saved last always wins over older/duplicate rows.
 */
export function rankWorkSchedules(rows: WorkforceDbRow[], ctx: ScheduleMatchContext): WorkforceDbRow[] {
  const deptCloseness = (dept?: string) => {
    const a = alnum(dept);
    const b = alnum(ctx.department);
    if (a && a === b) return 2;
    if (a && b && (a.includes(b) || b.includes(a))) return 1;
    return 0;
  };
  const stamp = (r: WorkforceDbRow) => Date.parse(String(r.updated_at ?? r.created_at ?? "")) || 0;
  return rows
    .map((r) => ({ r, score: scoreWorkSchedule(r, ctx) }))
    .filter((x) => x.score > 0)
    .sort(
      (x, y) =>
        y.score - x.score ||
        deptCloseness(y.r.department) - deptCloseness(x.r.department) ||
        stamp(y.r) - stamp(x.r),
    )
    .map((x) => x.r);
}

/**
 * Returns the canonical YYYY-MM-DD date string in Africa/Accra (or specified timezone).
 */
export function getAccraDateKey(referenceTimestamp?: string | Date, timeZone = "Africa/Accra"): string {
  const date = referenceTimestamp
    ? referenceTimestamp instanceof Date
      ? referenceTimestamp
      : new Date(referenceTimestamp)
    : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Returns true if the user role is an operational workforce role subject to staff time schedules.
 */
export function isWorkforceRole(role?: string | null): boolean {
  if (!role) return false;
  return !managementRoles.includes(role as UserRole);
}
