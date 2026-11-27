import { query, transaction } from "@/lib/db";
import type { ApiSession } from "@/lib/api-auth";
import { getRoleDisplayName, managementRoles } from "@/lib/roles";
import { propertyDayExpression } from "@/lib/operational-day";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { notifyAdminsAndGeneralManagers } from "@/lib/server-notifications";
import {
  getPropertySecondsOfDay,
  normalizeScheduleClassification,
  parseTimeToSeconds,
  resolveWorkforceSchedule,
  type WorkforceQueryExecutor,
} from "@/lib/workforce-schedule";

export type AttendanceAction = "check_in" | "check_out";

export type AttendanceQueryExecutor = <R = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: R[]; rowCount?: number | null }>;

export type AttendanceTransactionRunner = <T>(
  callback: (client: { query: AttendanceQueryExecutor }) => Promise<T>,
) => Promise<T>;

let attendanceSchemaEnsured = false;

/**
 * Idempotently ensures attendance_records, attendance_policy_events, and operational_outbox
 * exist with all columns required by both legacy and v2 workflows, and removes legacy
 * foreign-key or status check constraints that reject staff_profiles IDs or v2 statuses.
 * Always executed outside BEGIN/COMMIT blocks so DDL never aborts an active transaction.
 */
export async function ensureAttendanceSchema(
  executor: AttendanceQueryExecutor = query as unknown as AttendanceQueryExecutor,
  force = false,
): Promise<void> {
  if (attendanceSchemaEnsured && !force) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS attendance_records (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID,
       staff_id UUID NOT NULL,
       shift_id UUID,
       check_in_at TIMESTAMP WITH TIME ZONE,
       check_out_at TIMESTAMP WITH TIME ZONE,
       late_minutes INTEGER DEFAULT 0,
       early_checkout_minutes INTEGER DEFAULT 0,
       status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
       verification_status VARCHAR(50) NOT NULL DEFAULT 'pending',
       verified_by UUID,
       verified_at TIMESTAMP WITH TIME ZONE,
       notes TEXT,
       created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS user_id UUID`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS staff_id UUID`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS shift_id UUID`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS early_checkout_minutes INTEGER DEFAULT 0`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending_verification'`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'pending'`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS verified_by UUID`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS notes TEXT`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE attendance_records ALTER COLUMN shift_id DROP NOT NULL`,
    `ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_staff_id_fkey`,
    `ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_user_id_fkey`,
    `ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_verified_by_fkey`,
    `ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check`,
    `ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_verification_status_check`,
    `CREATE TABLE IF NOT EXISTS attendance_policy_events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       attendance_record_id UUID NOT NULL,
       staff_id UUID NOT NULL,
       event_type VARCHAR(50) NOT NULL,
       actor_id VARCHAR(255),
       idempotency_key VARCHAR(255) UNIQUE,
       payload JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `ALTER TABLE attendance_policy_events DROP CONSTRAINT IF EXISTS attendance_policy_events_staff_id_fkey`,
    `ALTER TABLE attendance_policy_events DROP CONSTRAINT IF EXISTS attendance_policy_events_actor_id_fkey`,
    `ALTER TABLE attendance_policy_events DROP CONSTRAINT IF EXISTS attendance_policy_events_attendance_record_id_fkey`,
    `CREATE TABLE IF NOT EXISTS operational_outbox (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       event_type VARCHAR(100) NOT NULL,
       aggregate_type VARCHAR(100) NOT NULL,
       aggregate_id VARCHAR(255) NOT NULL,
       idempotency_key VARCHAR(255) UNIQUE NOT NULL,
       payload JSONB NOT NULL DEFAULT '{}'::jsonb,
       status VARCHAR(50) NOT NULL DEFAULT 'pending',
       attempts INT NOT NULL DEFAULT 0,
       available_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
       processed_at TIMESTAMP WITH TIME ZONE,
       last_error TEXT,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS performance_events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       staff_id UUID NOT NULL,
       source_type VARCHAR(100) NOT NULL,
       source_id VARCHAR(255),
       points INTEGER NOT NULL DEFAULT 1,
       verification_status VARCHAR(50) DEFAULT 'verified',
       verified_by UUID,
       metadata JSONB DEFAULT '{}'::jsonb,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
     )`,
    `ALTER TABLE performance_events DROP CONSTRAINT IF EXISTS performance_events_staff_id_fkey`,
    `ALTER TABLE performance_events DROP CONSTRAINT IF EXISTS performance_events_verified_by_fkey`,
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

  for (const stmt of statements) {
    await executor(stmt).catch(() => undefined);
  }

  if (executor === (query as unknown as AttendanceQueryExecutor)) {
    attendanceSchemaEnsured = true;
  }
}

interface StaffIdentityRow {
  db_user_id?: string | null;
  db_email?: string | null;
  db_name?: string | null;
  staff_id?: string | null;
  sp_user_id?: string | null;
  sp_is_active?: boolean | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAccraDateString(timestamp: string | Date): string {
  const dt = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function defaultDepartmentForClassification(classification: string): string {
  if (classification === "Reception" || classification === "Housekeeping") return "Hotel";
  if (classification === "Security" || classification === "Labour" || classification === "Operations" || classification === "Accounts/Finance") {
    return "Operations";
  }
  return "Restaurant";
}

async function lookupStaffIdentity(
  session: Pick<ApiSession, "id" | "email">,
  executor: AttendanceQueryExecutor,
): Promise<StaffIdentityRow | undefined> {
  const email = String(session.email ?? "").trim();
  const res = await executor<StaffIdentityRow>(
    `SELECT db_user_id, db_email, db_name, staff_id, sp_user_id, sp_is_active
     FROM (
       SELECT
         u.id::text AS db_user_id,
         u.email AS db_email,
         u.name AS db_name,
         sp.id::text AS staff_id,
         sp.user_id::text AS sp_user_id,
         sp.is_active AS sp_is_active,
         CASE WHEN sp.user_id::text = $1::text THEN 0 WHEN sp.id::text = $1::text THEN 1 ELSE 2 END AS priority
       FROM staff_profiles sp
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id::text = $1::text
          OR sp.id::text = $1::text
          OR ($2::text <> '' AND LOWER(sp.business_email) = LOWER($2::text))
       UNION ALL
       SELECT
         u.id::text AS db_user_id,
         u.email AS db_email,
         u.name AS db_name,
         sp.id::text AS staff_id,
         sp.user_id::text AS sp_user_id,
         sp.is_active AS sp_is_active,
         CASE WHEN u.id::text = $1::text THEN 3 ELSE 4 END AS priority
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id OR LOWER(sp.business_email) = LOWER(u.email)
       WHERE u.id::text = $1::text
          OR ($2::text <> '' AND LOWER(u.email) = LOWER($2::text))
     ) matched
     ORDER BY priority ASC
     LIMIT 1`,
    [session.id, email],
  ).catch((err) => {
    console.warn("[attendance] Staff identity lookup warning:", err);
    return { rows: [] as StaffIdentityRow[] };
  });
  return res.rows[0];
}

/**
 * Resolves (and if necessary self-heals/provisions) the staff_profiles row for an authenticated
 * workforce user outside the attendance transaction so failed DDL/DML probes never abort BEGIN.
 */
export async function resolveAttendanceStaffIdentity(
  session: ApiSession,
  executor: AttendanceQueryExecutor = query as unknown as AttendanceQueryExecutor,
): Promise<{ userId: string; staffId: string }> {
  let found = await lookupStaffIdentity(session, executor);
  const cleanEmail = String(session.email || found?.db_email || `staff-${session.id.slice(0, 8)}@kumbisaly.com`)
    .trim()
    .toLowerCase();
  const displayName = String(session.name || found?.db_name || "Staff").trim() || "Staff";
  const [firstName, ...restName] = displayName.split(/\s+/);
  const lastName = restName.join(" ") || "Staff";

  let effectiveUserId = found?.db_user_id || found?.sp_user_id || session.id;

  // Ensure users row exists if session came from a canonical token-only fallback
  if (!found?.db_user_id && UUID_REGEX.test(effectiveUserId)) {
    try {
      const insertedUser = await executor<{ id: string }>(
        `INSERT INTO users (id, email, name, role, password_hash)
         SELECT $1::uuid, $2::varchar, $3::varchar, $4, 'managed'
         WHERE NOT EXISTS (
           SELECT 1 FROM users WHERE id = $1::uuid OR LOWER(email) = LOWER($5::text)
         )
         RETURNING id::text AS id`,
        [effectiveUserId, cleanEmail, displayName, session.role, cleanEmail],
      );
      if (insertedUser.rows[0]?.id) {
        effectiveUserId = insertedUser.rows[0].id;
      } else {
        const existingUser = await executor<{ id: string }>(
          `SELECT id::text AS id FROM users WHERE id::text = $1::text OR LOWER(email) = LOWER($2::text) LIMIT 1`,
          [effectiveUserId, cleanEmail],
        );
        if (existingUser.rows[0]?.id) {
          effectiveUserId = existingUser.rows[0].id;
        }
      }
    } catch {
      // Minimal schemas without password_hash column in users
      await executor(
        `INSERT INTO users (id, email, name, role)
         SELECT $1::uuid, $2::varchar, $3::varchar, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM users WHERE id = $1::uuid OR LOWER(email) = LOWER($5::text)
         )`,
        [effectiveUserId, cleanEmail, displayName, session.role, cleanEmail],
      ).catch(() => undefined);
    }
  }

  let staffId = found?.staff_id ?? undefined;
  if (staffId) {
    if (found?.sp_is_active !== true || !found?.sp_user_id) {
      await executor(
        `UPDATE staff_profiles
         SET is_active = true,
             user_id = COALESCE(user_id, $2::uuid)
         WHERE id = $1::uuid`,
        [staffId, effectiveUserId],
      ).catch(() => undefined);
    }
    return { userId: effectiveUserId, staffId };
  }

  const classification = normalizeScheduleClassification(session.role);
  const department = defaultDepartmentForClassification(classification);

  if (UUID_REGEX.test(effectiveUserId)) {
    const prov = await executor<{ id: string }>(
      `INSERT INTO staff_profiles (user_id, first_name, last_name, business_email, department, position, job_classification, password_hash, is_active)
       SELECT $1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::varchar, 'managed', true
       WHERE NOT EXISTS (
         SELECT 1 FROM staff_profiles WHERE user_id = $1::uuid OR LOWER(business_email) = LOWER($8::text)
       )
       RETURNING id::text AS id`,
      [effectiveUserId, firstName, lastName, cleanEmail, department, classification, classification, cleanEmail],
    ).catch(() => ({ rows: [] as { id: string }[] }));
    staffId = prov.rows[0]?.id;

    if (!staffId) {
      found = await lookupStaffIdentity({ id: effectiveUserId, email: cleanEmail }, executor);
      staffId = found?.staff_id ?? undefined;
      if (staffId && found?.sp_is_active !== true) {
        await executor(`UPDATE staff_profiles SET is_active = true WHERE id = $1::uuid`, [staffId]).catch(() => undefined);
      }
    }
  }

  if (!staffId) throw new Error("STAFF_PROFILE_REQUIRED");
  return { userId: effectiveUserId, staffId };
}

export interface AttendanceRecordRow {
  id: string;
  user_id?: string | null;
  staff_id: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  late_minutes?: number | null;
  early_checkout_minutes?: number | null;
  status: string;
  verification_status: string;
  verified_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Authoritative read for today's attendance record across /api/v2/attendance, /api/attendance,
 * and API permission gates. Matches by user_id, resolved DB user_id, or staff_profiles.id using
 * the canonical Africa/Accra operational day on COALESCE(check_in_at, created_at), and also
 * surfaces any still-open overnight shift started within the last 18 hours so late/night staff
 * can check out smoothly after midnight.
 */
export async function getTodayAttendanceRecord(
  session: Pick<ApiSession, "id" | "email">,
  referenceTimestamp?: string,
  executor: AttendanceQueryExecutor = query as unknown as AttendanceQueryExecutor,
): Promise<AttendanceRecordRow | null> {
  await ensureAttendanceSchema(executor, executor !== (query as unknown as AttendanceQueryExecutor));
  const canonicalNow = referenceTimestamp ?? (await getCanonicalTransactionTimestamp());
  const identity = await lookupStaffIdentity(session, executor);
  const resolvedUserId = identity?.db_user_id || identity?.sp_user_id || session.id;
  const resolvedStaffId = identity?.staff_id || "";

  const result = await executor<AttendanceRecordRow>(
    `SELECT id, user_id, staff_id, check_in_at, check_out_at, late_minutes, early_checkout_minutes, status, verification_status, verified_at
     FROM attendance_records ar
     WHERE (
       ar.user_id::text = $1::text
       OR ar.user_id::text = $2::text
       OR ar.staff_id::text = $1::text
       OR ar.staff_id::text = $2::text
       OR ($3::text <> '' AND ar.staff_id::text = $3::text)
     )
       AND (
         ${propertyDayExpression("COALESCE(ar.check_in_at, ar.created_at)")} = ${propertyDayExpression("$4::timestamptz")}
         OR (
           ar.check_in_at IS NOT NULL
           AND ar.check_out_at IS NULL
           AND ar.check_in_at >= ($4::timestamptz - interval '16 hours')
           AND ar.check_in_at <= $4::timestamptz
         )
       )
     ORDER BY
       (${propertyDayExpression("COALESCE(ar.check_in_at, ar.created_at)")} = ${propertyDayExpression("$4::timestamptz")}) DESC,
       COALESCE(ar.check_in_at, ar.created_at) DESC
     LIMIT 1`,
    [session.id, resolvedUserId, resolvedStaffId, canonicalNow],
  );
  return result.rows[0] ?? null;
}

async function runWithSavepoint(
  client: { query: AttendanceQueryExecutor },
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await client.query(`SAVEPOINT ${name}`);
    await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => undefined);
    console.warn(`[attendance] Non-fatal auxiliary event write skipped (${name}):`, err);
  }
}

export async function registerAttendance(
  session: ApiSession,
  action: AttendanceAction,
  notes?: string,
  options?: {
    canonicalNow?: string;
    executor?: AttendanceQueryExecutor;
    runTransaction?: AttendanceTransactionRunner;
    pushFetch?: typeof fetch;
  },
) {
  if (action === "check_in" && managementRoles.includes(session.role)) {
    throw new Error("MANAGERIAL_ROLE_CHECK_IN_FORBIDDEN");
  }

  const poolExecutor = options?.executor ?? (query as unknown as AttendanceQueryExecutor);
  const runTx: AttendanceTransactionRunner =
    options?.runTransaction ??
    ((cb) => transaction((client) => cb({ query: client.query.bind(client) as unknown as AttendanceQueryExecutor })));

  await ensureAttendanceSchema(poolExecutor, Boolean(options?.executor));
  const canonicalNow = options?.canonicalNow ?? (await getCanonicalTransactionTimestamp());
  const { userId, staffId } = await resolveAttendanceStaffIdentity(session, poolExecutor);

  // Resolve schedule BEFORE opening the DB transaction so schedule queries never taint BEGIN
  const schedule = await resolveWorkforceSchedule(
    userId,
    canonicalNow,
    poolExecutor as unknown as WorkforceQueryExecutor,
    session.role,
  );

  const txResult = await runTx(async (client) => {
    const current = await client.query<AttendanceRecordRow>(
      `SELECT id, user_id, staff_id, check_in_at, check_out_at, late_minutes, early_checkout_minutes, status, verification_status, verified_at
       FROM attendance_records ar
       WHERE (
         ar.staff_id::text = $1::text
         OR ar.user_id::text = $2::text
         OR ar.user_id::text = $3::text
         OR ar.staff_id::text = $2::text
       )
         AND (
           ${propertyDayExpression("COALESCE(ar.check_in_at, ar.created_at)")} = ${propertyDayExpression("$4::timestamptz")}
           OR (
             $5::text = 'check_out'
             AND ar.check_in_at IS NOT NULL
             AND ar.check_out_at IS NULL
             AND ar.check_in_at >= ($4::timestamptz - interval '24 hours')
             AND ar.check_in_at <= $4::timestamptz
           )
         )
       ORDER BY
         (${propertyDayExpression("COALESCE(ar.check_in_at, ar.created_at)")} = ${propertyDayExpression("$4::timestamptz")}) DESC,
         COALESCE(ar.check_in_at, ar.created_at) DESC
       LIMIT 1
       FOR UPDATE`,
      [staffId, userId, session.id, canonicalNow, action],
    );
    const record = current.rows[0];

    if (action === "check_in") {
      if (record?.check_in_at && !record.check_out_at) {
        if (!record.user_id && UUID_REGEX.test(userId)) {
          await client
            .query(`UPDATE attendance_records SET user_id = $2::uuid WHERE id = $1::uuid`, [record.id, userId])
            .catch(() => undefined);
        }
        throw new Error("ALREADY_CHECKED_IN");
      }

      let lateMinutes = 0;
      const startSec = parseTimeToSeconds(schedule?.startTime || "");
      const endSec = parseTimeToSeconds(schedule?.endTime || "");
      const nowSec = getPropertySecondsOfDay(canonicalNow);
      if (startSec !== null && (endSec === null || endSec > startSec) && nowSec > startSec) {
        lateMinutes = Math.max(0, Math.floor((nowSec - startSec) / 60));
      }

      const inserted = await client.query<AttendanceRecordRow>(
        `INSERT INTO attendance_records (user_id, staff_id, check_in_at, late_minutes, early_checkout_minutes, status, verification_status, notes, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::int, 0, 'pending_verification', 'pending', $5, $3::timestamptz, $3::timestamptz)
         RETURNING *`,
        [userId, staffId, canonicalNow, lateMinutes, notes?.slice(0, 500) || null],
      );
      const row = inserted.rows[0];

      const idempotencyKey = `attendance:${row.id}:check_in`;
      await runWithSavepoint(client, "sp_att_policy_in", async () => {
        await client.query(
          `INSERT INTO attendance_policy_events (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
           SELECT $1::uuid, $2::uuid, 'check_in', $3, $4::varchar, $5::jsonb
           WHERE NOT EXISTS (
             SELECT 1 FROM attendance_policy_events WHERE idempotency_key = $6::text
           )`,
          [
            row.id,
            staffId,
            userId,
            idempotencyKey,
            JSON.stringify({
              source: "attendance_service",
              clock: "canonical_property",
              scheduledStart: schedule?.startTime,
              scheduledEnd: schedule?.endTime,
              lateMinutes,
            }),
            idempotencyKey,
          ],
        );
      });

      const outboxKey = `attendance:${row.id}:checked_in`;
      await runWithSavepoint(client, "sp_att_outbox_in", async () => {
        await client.query(
          `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
           SELECT 'attendance.checked_in', 'attendance_record', $1::text, $2::text, $3::jsonb
           WHERE NOT EXISTS (
             SELECT 1 FROM operational_outbox WHERE idempotency_key = $2::text
           )`,
          [row.id, outboxKey, JSON.stringify({ attendanceRecordId: row.id, staffId, clock: "canonical_property" })],
        );
      });

      return { record: row, nextAction: "check_out" as const };
    }

    if (!record?.check_in_at) throw new Error("CHECK_IN_REQUIRED");
    if (record.check_out_at) throw new Error("ALREADY_CHECKED_OUT");

    // Calculate early_checkout_minutes against the resolved schedule end_time
    // WITHOUT hard-blocking check-out, so shifts ending at 23:59 or closing early always record check_out_at cleanly.
    let earlyCheckoutMinutes = 0;
    const scheduledEnd = schedule?.endTime;
    const scheduledStart = schedule?.startTime;
    if (scheduledEnd) {
      const endSec = parseTimeToSeconds(scheduledEnd);
      const startSec = scheduledStart ? parseTimeToSeconds(scheduledStart) : null;
      const nowSec = getPropertySecondsOfDay(canonicalNow);
      const checkInDay = getAccraDateString(record.check_in_at);
      const nowDay = getAccraDateString(canonicalNow);

      if (endSec !== null) {
        if (startSec !== null && endSec <= startSec) {
          // Overnight shift (crosses midnight): scheduled end is on (checkInDay + 1)
          const checkInMidnightUtc = new Date(`${checkInDay}T00:00:00.000Z`).getTime();
          const scheduledEndUtcMs = checkInMidnightUtc + 86_400_000 + endSec * 1000;
          const nowMs = new Date(canonicalNow).getTime();
          if (Number.isFinite(scheduledEndUtcMs) && Number.isFinite(nowMs) && nowMs < scheduledEndUtcMs) {
            earlyCheckoutMinutes = Math.max(0, Math.floor((scheduledEndUtcMs - nowMs) / 60_000));
          }
        } else if (checkInDay === nowDay && nowSec < endSec) {
          earlyCheckoutMinutes = Math.max(0, Math.floor((endSec - nowSec) / 60));
        }
      }
    }

    const checkoutStatus = earlyCheckoutMinutes > 0 ? "checked_out_early" : "checked_out";

    const updated = await client.query<AttendanceRecordRow>(
      `UPDATE attendance_records
       SET check_out_at = $2::timestamptz,
           early_checkout_minutes = $4::int,
           status = $5::varchar,
           updated_at = $2::timestamptz,
           user_id = COALESCE(user_id, $3::uuid)
       WHERE id = $1::uuid AND check_out_at IS NULL
       RETURNING *`,
      [record.id, canonicalNow, userId, earlyCheckoutMinutes, checkoutStatus],
    );
    if (!updated.rows[0]) throw new Error("ALREADY_CHECKED_OUT");
    const row = updated.rows[0];

    const idempotencyKey = `attendance:${row.id}:check_out`;
    await runWithSavepoint(client, "sp_att_policy_out", async () => {
      await client.query(
        `INSERT INTO attendance_policy_events (attendance_record_id, staff_id, event_type, actor_id, idempotency_key, payload)
         SELECT $1::uuid, $2::uuid, 'check_out', $3, $4::varchar, $5::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM attendance_policy_events WHERE idempotency_key = $6::text
         )`,
        [
          row.id,
          staffId,
          userId,
          idempotencyKey,
          JSON.stringify({
            source: "attendance_service",
            clock: "canonical_property",
            scheduledEnd: schedule?.endTime,
            earlyCheckoutMinutes,
          }),
          idempotencyKey,
        ],
      );
    });

    const outboxKey = `attendance:${row.id}:checked_out`;
    await runWithSavepoint(client, "sp_att_outbox_out", async () => {
      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         SELECT 'attendance.checked_out', 'attendance_record', $1::text, $2::text, $3::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM operational_outbox WHERE idempotency_key = $2::text
         )`,
        [
          row.id,
          outboxKey,
          JSON.stringify({
            attendanceRecordId: row.id,
            staffId,
            earlyCheckoutMinutes,
            clock: "canonical_property",
          }),
        ],
      );
    });

    return { record: row, nextAction: "complete" as const, earlyCheckoutMinutes };
  });

  try {
    const nameRow = await poolExecutor<{ display_name: string | null }>(
      `SELECT COALESCE(
         NULLIF(NULLIF(TRIM(u.name), ''), 'Staff member'),
         NULLIF(CONCAT_WS(' ', NULLIF(TRIM(sp.first_name), ''), NULLIF(TRIM(sp.last_name), '')), ''),
         NULLIF(TRIM(u.email), '')
       ) AS display_name
       FROM users u
       FULL OUTER JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE u.id::text = $1::text OR sp.id::text = $2::text OR sp.user_id::text = $1::text
       LIMIT 1`,
      [userId, staffId],
    ).catch(() => ({ rows: [] as Array<{ display_name: string | null }> }));

    const staffDisplayName =
      nameRow.rows[0]?.display_name?.trim() ||
      (session.name && session.name.trim() !== "Staff member" ? session.name.trim() : "") ||
      session.email ||
      "Staff member";

    const roleLabel = schedule?.job_classification || getRoleDisplayName(session.role) || "Staff";
    const deptLabel = schedule?.department ? `, ${schedule.department}` : "";
    const formattedTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Accra",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
      .format(new Date(canonicalNow))
      .toUpperCase();

    const row = txResult.record;
    if (action === "check_in") {
      const lateMins = Number(row.late_minutes ?? 0);
      const lateNote = lateMins > 0 ? ` (${lateMins}m late)` : "";
      await notifyAdminsAndGeneralManagers(
        {
          title: `Staff Check-In: ${staffDisplayName}`,
          message: `${staffDisplayName} (${roleLabel}${deptLabel}) checked in at ${formattedTime}${lateNote}.`,
          type: "attendance_check_in",
          url: "/attendance",
          dedupeKey: `attendance_check_in:${row.id}`,
          excludeUserIds: [userId],
          metadata: {
            attendanceId: row.id,
            staffId: row.staff_id,
            userId,
            staffName: staffDisplayName,
            staffRole: session.role,
            department: schedule?.department ?? null,
            action: "check_in",
            timestamp: canonicalNow,
            lateMinutes: lateMins,
          },
          fetchImpl: options?.pushFetch,
        },
        poolExecutor,
      );
    } else {
      const earlyMins = Number(row.early_checkout_minutes ?? 0);
      const earlyNote = earlyMins > 0 ? ` (${earlyMins}m before scheduled close)` : "";
      await notifyAdminsAndGeneralManagers(
        {
          title: `Staff Check-Out: ${staffDisplayName}`,
          message: `${staffDisplayName} (${roleLabel}${deptLabel}) checked out at ${formattedTime}${earlyNote}.`,
          type: "attendance_check_out",
          url: "/attendance",
          dedupeKey: `attendance_check_out:${row.id}`,
          excludeUserIds: [userId],
          metadata: {
            attendanceId: row.id,
            staffId: row.staff_id,
            userId,
            staffName: staffDisplayName,
            staffRole: session.role,
            department: schedule?.department ?? null,
            action: "check_out",
            timestamp: canonicalNow,
            earlyCheckoutMinutes: earlyMins,
          },
          fetchImpl: options?.pushFetch,
        },
        poolExecutor,
      );
    }
  } catch (notifyErr) {
    console.warn("[attendance] Non-fatal Admin/GM notification dispatch warning:", notifyErr);
  }

  return txResult;
}

/**
 * Automatically checks out open attendance records whose resolved Admin schedule end_time
 * has been reached in Africa/Accra property time (including unclosed shifts from prior days
 * such as 23:59 shifts when the cron runs after midnight, and overnight shifts).
 */
export async function runScheduledAutoCheckout(
  canonicalNow: string,
  executor: AttendanceQueryExecutor = query as unknown as AttendanceQueryExecutor,
): Promise<{ updated: number; records: Array<{ id: string; staff_id: string; check_out_at: string }> }> {
  await ensureAttendanceSchema(executor, executor !== (query as unknown as AttendanceQueryExecutor));

  const openRes = await executor<{
    id: string;
    user_id?: string | null;
    staff_id: string;
    user_role?: string | null;
    check_in_at: string;
  }>(
    `SELECT
       ar.id::text AS id,
       COALESCE(ar.user_id, sp.user_id)::text AS user_id,
       ar.staff_id::text AS staff_id,
       u.role::text AS user_role,
       COALESCE(ar.check_in_at, ar.created_at)::text AS check_in_at
     FROM attendance_records ar
     LEFT JOIN staff_profiles sp ON sp.id = ar.staff_id OR sp.user_id = ar.staff_id
     LEFT JOIN users u ON u.id = COALESCE(ar.user_id, sp.user_id, ar.staff_id)
     WHERE ar.check_in_at IS NOT NULL
       AND ar.check_out_at IS NULL
       AND ${propertyDayExpression("COALESCE(ar.check_in_at, ar.created_at)")} <= ${propertyDayExpression("$1::timestamptz")}`,
    [canonicalNow],
  );

  if (!openRes.rows.length) {
    return { updated: 0, records: [] };
  }

  const nowSeconds = getPropertySecondsOfDay(canonicalNow);
  const nowDay = getAccraDateString(canonicalNow);
  const nowMs = new Date(canonicalNow).getTime();
  const dueIds: string[] = [];

  for (const row of openRes.rows) {
    const lookupKey = row.user_id || row.staff_id;
    const schedule = await resolveWorkforceSchedule(
      lookupKey,
      row.check_in_at || canonicalNow,
      executor as unknown as WorkforceQueryExecutor,
      row.user_role ?? undefined,
    );
    const startSeconds = parseTimeToSeconds(schedule.start_time);
    const endSeconds = parseTimeToSeconds(schedule.end_time);
    if (endSeconds === null) continue;

    const checkInDay = getAccraDateString(row.check_in_at);
    const isOvernight = startSeconds !== null && endSeconds <= startSeconds;

    if (isOvernight) {
      const checkInMidnightUtc = new Date(`${checkInDay}T00:00:00.000Z`).getTime();
      const scheduledEndUtcMs = checkInMidnightUtc + 86_400_000 + endSeconds * 1000;
      if (Number.isFinite(scheduledEndUtcMs) && nowMs >= scheduledEndUtcMs) {
        dueIds.push(row.id);
      }
    } else if (checkInDay < nowDay || (checkInDay === nowDay && nowSeconds >= endSeconds)) {
      dueIds.push(row.id);
    }
  }

  if (!dueIds.length) {
    return { updated: 0, records: [] };
  }

  const updatedRes = await executor<{ id: string; staff_id: string; check_out_at: string }>(
    `UPDATE attendance_records ar
     SET check_out_at = $2::timestamptz,
         status = 'auto_checked_out',
         updated_at = $2::timestamptz,
         notes = CONCAT_WS(' ', ar.notes, 'Automatically checked out at scheduled shift end.')
     WHERE ar.id = ANY($1::uuid[])
       AND ar.check_out_at IS NULL
     RETURNING ar.id, ar.staff_id, ar.check_out_at`,
    [dueIds, canonicalNow],
  );

  return {
    updated: updatedRes.rowCount ?? updatedRes.rows.length,
    records: updatedRes.rows,
  };
}
