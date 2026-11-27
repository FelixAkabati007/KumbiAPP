import { query, type DatabaseClient } from "@/lib/db";
import { PROPERTY_TIME_ZONE } from "@/lib/property-time";
import {
  DEFAULT_ADMIN_USER_ID,
  DEFAULT_GENERAL_MANAGER_USER_ID,
  dispatchNotificationsRealtimeAndPush,
  ensureNotificationsSchema,
} from "@/lib/server-notifications";

export type GymQueryExecutor = <R = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: R[]; rowCount?: number | null }>;

export const DEFAULT_FINANCE_USER_ID = "00000000-0000-4000-8000-000000000005";

export type GymPlanType =
  | "walk_in_session"
  | "day_pass"
  | "membership"
  | "personal_training"
  | "corporate";

export interface DefaultGymPlanSeed {
  code: string;
  name: string;
  description: string;
  plan_type: GymPlanType;
  duration_days: number;
  max_sessions: number | null;
  base_price: number;
  includes_trainer: boolean;
  max_capacity_per_slot: number;
}

export const DEFAULT_GYM_PLANS: DefaultGymPlanSeed[] = [
  {
    code: "GYM-WALKIN-SESSION",
    name: "Single Gym Workout Session",
    description: "2-hour standard gym floor & cardio access for walk-in clients.",
    plan_type: "walk_in_session",
    duration_days: 1,
    max_sessions: 1,
    base_price: 50,
    includes_trainer: false,
    max_capacity_per_slot: 30,
  },
  {
    code: "GYM-DAY-PASS",
    name: "Full-Day Fitness Pass",
    description: "All-day access to gym floor, weights, cardio, and locker facilities.",
    plan_type: "day_pass",
    duration_days: 1,
    max_sessions: null,
    base_price: 80,
    includes_trainer: false,
    max_capacity_per_slot: 30,
  },
  {
    code: "GYM-PT-SESSION",
    name: "Personal Training Session (1-on-1)",
    description: "Guided 60-minute personal training workout with a certified fitness coach.",
    plan_type: "personal_training",
    duration_days: 1,
    max_sessions: 1,
    base_price: 150,
    includes_trainer: true,
    max_capacity_per_slot: 10,
  },
  {
    code: "GYM-WEEKLY-PASS",
    name: "Weekly Unlimited Pass (7 Days)",
    description: "7 consecutive days of unlimited gym & cardio workouts.",
    plan_type: "membership",
    duration_days: 7,
    max_sessions: null,
    base_price: 220,
    includes_trainer: false,
    max_capacity_per_slot: 30,
  },
  {
    code: "GYM-MONTHLY-STD",
    name: "Monthly Unlimited Membership (30 Days)",
    description: "30 days unlimited gym access with initial fitness assessment.",
    plan_type: "membership",
    duration_days: 30,
    max_sessions: null,
    base_price: 550,
    includes_trainer: false,
    max_capacity_per_slot: 30,
  },
  {
    code: "GYM-QUARTERLY-PRO",
    name: "Quarterly Pro Membership (90 Days)",
    description: "90 days unlimited gym access plus 3 personal training check-ins.",
    plan_type: "membership",
    duration_days: 90,
    max_sessions: null,
    base_price: 1450,
    includes_trainer: true,
    max_capacity_per_slot: 30,
  },
  {
    code: "GYM-ANNUAL-VIP",
    name: "Annual VIP Wellness Membership (365 Days)",
    description: "Full-year unlimited gym access, priority slot booking, and monthly trainer review.",
    plan_type: "membership",
    duration_days: 365,
    max_sessions: null,
    base_price: 4800,
    includes_trainer: true,
    max_capacity_per_slot: 30,
  },
  {
    code: "GYM-HOTEL-COMP",
    name: "Checked-In Hotel Guest Pass",
    description: "Complimentary fitness session for verified checked-in hotel guests.",
    plan_type: "walk_in_session",
    duration_days: 1,
    max_sessions: 1,
    base_price: 0,
    includes_trainer: false,
    max_capacity_per_slot: 30,
  },
];

let gymSchemaEnsured = false;

export async function ensureGymSchema(
  executor: GymQueryExecutor = query as unknown as GymQueryExecutor,
): Promise<void> {
  if (gymSchemaEnsured && executor === (query as unknown as GymQueryExecutor)) {
    return;
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS gym_plans (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       code VARCHAR(60) UNIQUE NOT NULL,
       name VARCHAR(160) NOT NULL,
       description TEXT,
       plan_type VARCHAR(40) NOT NULL DEFAULT 'walk_in_session'
         CHECK (plan_type IN ('walk_in_session', 'day_pass', 'membership', 'personal_training', 'corporate')),
       duration_days INTEGER NOT NULL DEFAULT 1 CHECK (duration_days >= 1),
       max_sessions INTEGER,
       base_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
       currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
       includes_trainer BOOLEAN NOT NULL DEFAULT false,
       max_capacity_per_slot INTEGER NOT NULL DEFAULT 30 CHECK (max_capacity_per_slot >= 1),
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS gym_members (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       member_number VARCHAR(60) UNIQUE NOT NULL,
       guest_id UUID,
       first_name VARCHAR(120) NOT NULL,
       last_name VARCHAR(120) NOT NULL,
       email VARCHAR(255),
       phone VARCHAR(50) NOT NULL,
       emergency_contact_name VARCHAR(160),
       emergency_contact_phone VARCHAR(50),
       health_notes TEXT,
       status VARCHAR(30) NOT NULL DEFAULT 'active'
         CHECK (status IN ('active', 'inactive', 'suspended')),
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS gym_memberships (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       membership_number VARCHAR(60) UNIQUE NOT NULL,
       member_id UUID NOT NULL REFERENCES gym_members(id) ON DELETE RESTRICT,
       plan_id UUID NOT NULL REFERENCES gym_plans(id) ON DELETE RESTRICT,
       start_date DATE NOT NULL,
       end_date DATE NOT NULL,
       sessions_total INTEGER,
       sessions_used INTEGER NOT NULL DEFAULT 0,
       subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
       discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
       tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
       total_invoiced NUMERIC(12, 2) NOT NULL DEFAULT 0,
       total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
       balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
       status VARCHAR(40) NOT NULL DEFAULT 'pending_payment'
         CHECK (status IN ('pending_payment', 'active', 'expired', 'paused', 'cancelled')),
       finance_status VARCHAR(40) NOT NULL DEFAULT 'unpaid'
         CHECK (finance_status IN ('unpaid', 'pending_verification', 'partially_paid', 'settled', 'waived', 'refunded')),
       notes TEXT,
       receipt_id UUID,
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS gym_bookings (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       booking_number VARCHAR(60) UNIQUE NOT NULL,
       member_id UUID NOT NULL REFERENCES gym_members(id) ON DELETE RESTRICT,
       membership_id UUID REFERENCES gym_memberships(id) ON DELETE SET NULL,
       plan_id UUID REFERENCES gym_plans(id) ON DELETE SET NULL,
       reservation_id UUID,
       trainer_name VARCHAR(160),
       session_date DATE NOT NULL,
       starts_at TIMESTAMPTZ NOT NULL,
       ends_at TIMESTAMPTZ NOT NULL,
       attendee_count INTEGER NOT NULL DEFAULT 1 CHECK (attendee_count >= 1),
       status VARCHAR(40) NOT NULL DEFAULT 'booked'
         CHECK (status IN ('booked', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')),
       check_in_at TIMESTAMPTZ,
       check_out_at TIMESTAMPTZ,
       checked_in_by VARCHAR(255),
       subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
       discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
       tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
       total_invoiced NUMERIC(12, 2) NOT NULL DEFAULT 0,
       total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
       balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
       payment_status VARCHAR(40) NOT NULL DEFAULT 'unpaid'
         CHECK (payment_status IN ('covered_by_membership', 'complimentary_hotel_guest', 'unpaid', 'pending_finance_verification', 'partially_paid', 'paid', 'charged_to_room', 'refunded')),
       finance_status VARCHAR(40) NOT NULL DEFAULT 'not_required'
         CHECK (finance_status IN ('not_required', 'invoice_posted', 'pending_verification', 'verified_posted', 'settled', 'refund_pending', 'refunded')),
       notes TEXT,
       cancellation_reason TEXT,
       cancelled_by VARCHAR(255),
       cancelled_at TIMESTAMPTZ,
       receipt_id UUID,
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS gym_payments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       payment_reference VARCHAR(100) UNIQUE NOT NULL,
       booking_id UUID REFERENCES gym_bookings(id) ON DELETE SET NULL,
       membership_id UUID REFERENCES gym_memberships(id) ON DELETE SET NULL,
       member_id UUID NOT NULL REFERENCES gym_members(id) ON DELETE RESTRICT,
       amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
       currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
       method VARCHAR(50) NOT NULL,
       provider_reference VARCHAR(160),
       idempotency_key VARCHAR(160) UNIQUE NOT NULL,
       status VARCHAR(40) NOT NULL DEFAULT 'completed'
         CHECK (status IN ('pending', 'completed', 'reversed', 'refunded')),
       verification_status VARCHAR(40) NOT NULL DEFAULT 'pending_reconciliation'
         CHECK (verification_status IN ('pending_verification', 'pending_reconciliation', 'verified_by_finance', 'rejected', 'reversed')),
       recorded_by VARCHAR(255) NOT NULL,
       recorded_by_name VARCHAR(160),
       recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       verified_by VARCHAR(255),
       verified_by_name VARCHAR(160),
       verified_at TIMESTAMPTZ,
       finance_note TEXT,
       reversed_by VARCHAR(255),
       reversed_at TIMESTAMPTZ,
       reversal_reason TEXT,
       ledger_entry_id VARCHAR(255),
       receipt_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS gym_refund_requests (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       refund_number VARCHAR(80) UNIQUE NOT NULL,
       booking_id UUID REFERENCES gym_bookings(id) ON DELETE SET NULL,
       membership_id UUID REFERENCES gym_memberships(id) ON DELETE SET NULL,
       payment_id UUID NOT NULL REFERENCES gym_payments(id) ON DELETE RESTRICT,
       member_id UUID NOT NULL REFERENCES gym_members(id) ON DELETE RESTRICT,
       amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
       currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
       reason TEXT NOT NULL,
       status VARCHAR(40) NOT NULL DEFAULT 'pending_finance_approval'
         CHECK (status IN ('pending_finance_approval', 'approved', 'rejected')),
       requested_by VARCHAR(255) NOT NULL,
       requested_by_name VARCHAR(160),
       approved_by VARCHAR(255),
       approved_by_name VARCHAR(160),
       approved_at TIMESTAMPTZ,
       rejection_reason TEXT,
       ledger_entry_id VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gym_bookings_session_date ON gym_bookings(session_date, status)`,
    `CREATE INDEX IF NOT EXISTS idx_gym_bookings_member_id ON gym_bookings(member_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gym_memberships_member_status ON gym_memberships(member_id, status, end_date)`,
    `CREATE INDEX IF NOT EXISTS idx_gym_payments_verification ON gym_payments(verification_status, recorded_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_gym_refunds_status ON gym_refund_requests(status, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS canonical_financial_ledger (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       event_key VARCHAR(255) UNIQUE NOT NULL,
       amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
       currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
       direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
       status VARCHAR(50) NOT NULL DEFAULT 'posted',
       source VARCHAR(100) NOT NULL,
       payment_method VARCHAR(80),
       entity_type VARCHAR(100),
       entity_id VARCHAR(255),
       original_entry_id VARCHAR(255),
       journal_type VARCHAR(50) DEFAULT 'operational',
       source_event_id VARCHAR(255),
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `ALTER TABLE canonical_financial_ledger ADD COLUMN IF NOT EXISTS original_entry_id VARCHAR(255)`,
    `ALTER TABLE canonical_financial_ledger ADD COLUMN IF NOT EXISTS journal_type VARCHAR(50) DEFAULT 'operational'`,
    `ALTER TABLE canonical_financial_ledger ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(255)`,
    `CREATE TABLE IF NOT EXISTS transaction_logs (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       transaction_id VARCHAR(255) NOT NULL,
       amount NUMERIC(12, 2) NOT NULL,
       currency VARCHAR(10) DEFAULT 'GHS',
       status VARCHAR(50) NOT NULL,
       payment_method VARCHAR(50),
       customer_id VARCHAR(255),
       items JSONB,
       metadata JSONB,
       created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS canonical_receipts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       identity_key VARCHAR(255) UNIQUE NOT NULL,
       source VARCHAR(50) NOT NULL,
       entity_id VARCHAR(255) NOT NULL,
       receipt_number VARCHAR(120) NOT NULL,
       version INTEGER NOT NULL DEFAULT 1,
       print_method VARCHAR(40) NOT NULL DEFAULT 'browser',
       payload JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS canonical_receipt_print_attempts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       receipt_id UUID NOT NULL REFERENCES canonical_receipts(id) ON DELETE CASCADE,
       idempotency_key VARCHAR(255) UNIQUE NOT NULL,
       print_method VARCHAR(40) NOT NULL DEFAULT 'browser',
       status VARCHAR(40) NOT NULL DEFAULT 'queued',
       requested_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  ];

  for (const stmt of statements) {
    await executor(stmt).catch(() => undefined);
  }

  // Seed default catalog plans if empty
  const existingCount = await executor<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM gym_plans`,
  ).catch(() => ({ rows: [{ count: "0" }] }));

  if (Number(existingCount.rows[0]?.count ?? 0) === 0) {
    for (const plan of DEFAULT_GYM_PLANS) {
      await executor(
        `INSERT INTO gym_plans (
           code, name, description, plan_type, duration_days, max_sessions,
           base_price, currency, includes_trainer, max_capacity_per_slot, is_active
         )
         VALUES ($1::varchar, $2::varchar, $3::text, $4::varchar, $5::int, $6::int, $7::numeric, 'GHS', $8::boolean, $9::int, true)
         ON CONFLICT (code) DO NOTHING`,
        [
          plan.code,
          plan.name,
          plan.description,
          plan.plan_type,
          plan.duration_days,
          plan.max_sessions,
          plan.base_price,
          plan.includes_trainer,
          plan.max_capacity_per_slot,
        ],
      ).catch(() => undefined);
    }
  }

  if (executor === (query as unknown as GymQueryExecutor)) {
    gymSchemaEnsured = true;
  }
}

export function formatAccraCompactDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}${m}${d}`;
}

export interface GymDbClient {
  query: <R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: R[]; rowCount?: number | null }>;
}

export async function generateGymReferenceNumber(
  clientOrExecutor: Pick<DatabaseClient, "query"> | GymDbClient,
  prefix: "GYM-MEM" | "GYM-SUB" | "GYM-BK" | "GYM-PAY" | "GYM-REF",
  table: "gym_members" | "gym_memberships" | "gym_bookings" | "gym_payments" | "gym_refund_requests",
  column: "member_number" | "membership_number" | "booking_number" | "payment_reference" | "refund_number",
): Promise<string> {
  const exec = (clientOrExecutor as GymDbClient).query.bind(clientOrExecutor);
  const compactDate = formatAccraCompactDate();
  const lockKey = `kumbiapp-gym-seq:${prefix}:${compactDate}`;
  await exec(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [lockKey]);

  const pattern = `${prefix}-${compactDate}-%`;
  const countRes = await exec<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM ${table} WHERE ${column} LIKE $1::text`,
    [pattern],
  );
  const nextSeq = Number(countRes.rows[0]?.total ?? 0) + 1;
  return `${prefix}-${compactDate}-${String(nextSeq).padStart(4, "0")}`;
}

export async function notifyFinanceAndManagementForGym(
  input: {
    title: string;
    message: string;
    type: string;
    url?: string;
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
    extraRecipientIds?: string[];
  },
  executor: GymQueryExecutor = query as unknown as GymQueryExecutor,
): Promise<void> {
  try {
    await ensureNotificationsSchema(executor);
    const recipients = new Set<string>(
      (input.extraRecipientIds ?? []).map((id) => String(id).trim()).filter(Boolean),
    );

    const roleUsers = await executor<{ id: string }>(
      `SELECT id::text AS id
       FROM users
       WHERE role IN ('finance', 'admin', 'manager')
         AND COALESCE(is_active, true) = true`,
    ).catch(() => ({ rows: [] as Array<{ id: string }> }));

    for (const row of roleUsers.rows) {
      if (row.id) recipients.add(row.id);
    }
    recipients.add(DEFAULT_FINANCE_USER_ID);
    recipients.add(DEFAULT_ADMIN_USER_ID);
    recipients.add(DEFAULT_GENERAL_MANAGER_USER_ID);

    const metadataJson = JSON.stringify({
      ...(input.metadata ?? {}),
      url: input.url || "/finance",
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    });

    const recipientList = Array.from(recipients);
    for (const recipientId of recipientList) {
      if (input.dedupeKey) {
        const dup = await executor<{ id: string }>(
          `SELECT id::text AS id
           FROM notifications
           WHERE recipient_user_id::text = $1::text
             AND metadata->>'dedupeKey' = $2::text
           LIMIT 1`,
          [recipientId, input.dedupeKey],
        ).catch(() => ({ rows: [] as Array<{ id: string }> }));
        if (dup.rows[0]?.id) continue;
      }

      await executor(
        `INSERT INTO notifications (recipient_user_id, title, message, type, metadata)
         VALUES ($1::varchar, $2::varchar, $3::text, $4::varchar, $5::jsonb)`,
        [recipientId, input.title.slice(0, 250), input.message, input.type.slice(0, 95), metadataJson],
      ).catch(() => undefined);
    }

    await dispatchNotificationsRealtimeAndPush(
      {
        recipientUserIds: recipientList,
        includeAdminAndGmRoles: true,
        title: input.title,
        message: input.message,
        type: input.type,
        url: input.url || "/finance",
        tag: input.dedupeKey,
      },
      executor,
    ).catch(() => undefined);
  } catch (err) {
    console.warn("[gym] Finance notification dispatch warning:", err);
  }
}
