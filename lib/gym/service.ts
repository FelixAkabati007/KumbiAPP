import { canonicalReceiptKey } from "@/lib/canonical-receipts";
import type { DatabaseClient } from "@/lib/db";
import { financeClassificationMetadata } from "@/lib/finance-classification";
import {
  ensureGymSchema,
  generateGymReferenceNumber,
  type GymQueryExecutor,
} from "@/lib/gym/schema";
import { recordWorkforcePerformanceEvent } from "@/lib/performance-service";
import { PROPERTY_TIME_ZONE } from "@/lib/property-time";
import { calculateTaxes, defaultTaxConfiguration, roundMoney } from "@/lib/tax";
import type { TaxConfiguration } from "@/lib/settings";

export interface GymActor {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export const ALLOWED_GYM_PAYMENT_METHODS = [
  "cash",
  "card",
  "mobile_money",
  "mobile",
  "bank_transfer",
  "room_charge",
  "guest_folio",
] as const;

export type GymPaymentMethod = (typeof ALLOWED_GYM_PAYMENT_METHODS)[number];

export function normalizeGymPaymentMethod(raw: unknown): GymPaymentMethod | null {
  const cleaned = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (cleaned === "momo" || cleaned === "mobile") return "mobile_money";
  if (cleaned === "folio" || cleaned === "hotel_folio" || cleaned === "guest_folio") {
    return "room_charge";
  }
  if ((ALLOWED_GYM_PAYMENT_METHODS as readonly string[]).includes(cleaned)) {
    return cleaned as GymPaymentMethod;
  }
  return null;
}

export function getAccraDateIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysToDateIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, days - 1));
  return dt.toISOString().slice(0, 10);
}

async function persistGymCanonicalReceiptOnClient(
  client: Pick<DatabaseClient, "query">,
  input: {
    entityId: string;
    receiptNumber: string;
    customerName: string;
    paymentMethod: string;
    subtotal: number;
    tax: number;
    total: number;
    discountAmount?: number;
    items: Array<{ id: string; name: string; description?: string; price: number; quantity: number }>;
    actor: GymActor;
    orderType: string;
  },
): Promise<string | null> {
  const receiptNum = input.receiptNumber.trim().toUpperCase();
  const identityKey = canonicalReceiptKey({
    source: "gym",
    entityId: input.entityId,
    receiptNumber: receiptNum,
    version: 1,
  });

  const payload = {
    id: input.entityId,
    orderNumber: receiptNum,
    orderId: input.entityId,
    date: new Date().toISOString(),
    source: "gym",
    department: "Gym & Fitness",
    orderType: input.orderType,
    customerName: input.customerName,
    paymentMethod: input.paymentMethod,
    subtotal: roundMoney(input.subtotal),
    tax: roundMoney(input.tax),
    total: roundMoney(input.total),
    discountAmount: roundMoney(input.discountAmount ?? 0),
    items: input.items,
    performedBy: {
      id: input.actor.id,
      name: input.actor.name ?? input.actor.email ?? "Gym Staff",
      accountName: input.actor.name ?? input.actor.email ?? input.actor.id,
      email: input.actor.email ?? null,
      role: input.actor.role ?? null,
    },
  };

  const res = await client.query<{ id: string }>(
    `INSERT INTO canonical_receipts (
       identity_key, source, entity_id, receipt_number, version, print_method, payload
     )
     VALUES ($1::varchar, 'gym', $2::varchar, $3::varchar, 1, 'browser', $4::jsonb)
     ON CONFLICT (identity_key) DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = CURRENT_TIMESTAMP
     RETURNING id::text AS id`,
    [identityKey, input.entityId, receiptNum, JSON.stringify(payload)],
  );

  return res.rows[0]?.id ?? null;
}

async function insertTransactionLogSafe(
  client: Pick<DatabaseClient, "query">,
  input: {
    transactionId: string;
    amount: number;
    status: string;
    paymentMethod: string;
    customerId: string | null;
    items: unknown[];
    metadata: Record<string, unknown>;
  },
) {
  await client.query(
    `INSERT INTO transaction_logs (
       transaction_id, amount, currency, status, payment_method, customer_id, items, metadata
     )
     SELECT $1::varchar, $2::numeric, 'GHS', $3::varchar, $4::varchar, $5::varchar, $6::jsonb, $7::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM transaction_logs WHERE transaction_id = $1::varchar
     )`,
    [
      input.transactionId,
      roundMoney(input.amount),
      input.status,
      input.paymentMethod,
      input.customerId,
      JSON.stringify(input.items),
      JSON.stringify(input.metadata),
    ],
  );
}

export async function createGymMemberTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string | null;
    guestId?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    healthNotes?: string | null;
    actor: GymActor;
  },
) {
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  if (!firstName || !lastName || !phone) {
    throw new Error("First name, last name, and phone number are required");
  }

  const memberNumber = await generateGymReferenceNumber(
    client,
    "GYM-MEM",
    "gym_members",
    "member_number",
  );
  const guestUuid =
    input.guestId && /^[0-9a-f-]{36}$/i.test(input.guestId.trim())
      ? input.guestId.trim()
      : null;

  const inserted = await client.query<Record<string, unknown>>(
    `INSERT INTO gym_members (
       member_number, guest_id, first_name, last_name, email, phone,
       emergency_contact_name, emergency_contact_phone, health_notes, status, created_by
     )
     VALUES (
       $1::varchar, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::varchar,
       $7::varchar, $8::varchar, $9::text, 'active', $10::varchar
     )
     RETURNING *`,
    [
      memberNumber,
      guestUuid,
      firstName,
      lastName,
      input.email?.trim() || null,
      phone,
      input.emergencyContactName?.trim() || null,
      input.emergencyContactPhone?.trim() || null,
      input.healthNotes?.trim() || null,
      input.actor.id,
    ],
  );

  return inserted.rows[0];
}

export async function createGymMembershipTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    memberId: string;
    planId: string;
    startDate?: string;
    discountAmount?: number;
    notes?: string | null;
    taxConfig?: Partial<TaxConfiguration>;
    actor: GymActor;
  },
) {
  const planRes = await client.query<{
    id: string;
    code: string;
    name: string;
    duration_days: number;
    max_sessions: number | null;
    base_price: string;
    is_active: boolean;
  }>(
    `SELECT id::text AS id, code, name, duration_days, max_sessions, base_price::text AS base_price, is_active
     FROM gym_plans
     WHERE id = $1::uuid`,
    [input.planId],
  );
  const plan = planRes.rows[0];
  if (!plan || !plan.is_active) {
    throw new Error("Selected gym plan was not found or is inactive");
  }

  const memberRes = await client.query<{ id: string; status: string }>(
    `SELECT id::text AS id, status FROM gym_members WHERE id = $1::uuid`,
    [input.memberId],
  );
  if (!memberRes.rows[0]) {
    throw new Error("Gym member not found");
  }
  if (memberRes.rows[0].status === "suspended") {
    throw new Error("Cannot enroll a suspended gym member");
  }

  const startDate = input.startDate?.trim() || getAccraDateIso();
  const endDate = addDaysToDateIso(startDate, Number(plan.duration_days) || 30);

  const rawPrice = Math.max(0, Number(plan.base_price) || 0);
  const discount = Math.min(rawPrice, Math.max(0, Number(input.discountAmount) || 0));
  const netBeforeTax = roundMoney(rawPrice - discount);
  const taxCalc = calculateTaxes(
    netBeforeTax,
    input.taxConfig ?? defaultTaxConfiguration,
    "gym",
  );

  const membershipNumber = await generateGymReferenceNumber(
    client,
    "GYM-SUB",
    "gym_memberships",
    "membership_number",
  );

  const isFree = taxCalc.total <= 0;
  const status = isFree ? "active" : "pending_payment";
  const financeStatus = isFree ? "waived" : "unpaid";

  const inserted = await client.query<Record<string, unknown>>(
    `INSERT INTO gym_memberships (
       membership_number, member_id, plan_id, start_date, end_date,
       sessions_total, sessions_used, subtotal, discount_amount, tax_amount,
       total_invoiced, total_paid, balance_due, status, finance_status, notes, created_by
     )
     VALUES (
       $1::varchar, $2::uuid, $3::uuid, $4::date, $5::date,
       $6::int, 0, $7::numeric, $8::numeric, $9::numeric,
       $10::numeric, 0, $11::numeric, $12::varchar, $13::varchar, $14::text, $15::varchar
     )
     RETURNING *`,
    [
      membershipNumber,
      input.memberId,
      input.planId,
      startDate,
      endDate,
      plan.max_sessions,
      taxCalc.subtotal,
      discount,
      taxCalc.tax,
      taxCalc.total,
      taxCalc.total,
      status,
      financeStatus,
      input.notes?.trim() || null,
      input.actor.id,
    ],
  );

  return {
    membership: inserted.rows[0],
    plan,
    taxBreakdown: taxCalc,
  };
}

export async function createGymBookingTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    memberId: string;
    planId?: string | null;
    membershipId?: string | null;
    reservationId?: string | null;
    trainerName?: string | null;
    sessionDate?: string;
    startsAt?: string;
    endsAt?: string;
    attendeeCount?: number;
    discountAmount?: number;
    notes?: string | null;
    taxConfig?: Partial<TaxConfiguration>;
    actor: GymActor;
  },
) {
  const memberRes = await client.query<{
    id: string;
    first_name: string;
    last_name: string;
    status: string;
  }>(
    `SELECT id::text AS id, first_name, last_name, status
     FROM gym_members
     WHERE id = $1::uuid`,
    [input.memberId],
  );
  const member = memberRes.rows[0];
  if (!member) throw new Error("Gym member not found");
  if (member.status === "suspended") {
    throw new Error("Suspended members cannot book gym sessions");
  }

  const sessionDate = input.sessionDate?.trim() || getAccraDateIso();
  const startsAt = input.startsAt
    ? new Date(input.startsAt).toISOString()
    : new Date(`${sessionDate}T08:00:00Z`).toISOString();
  const endsAt = input.endsAt
    ? new Date(input.endsAt).toISOString()
    : new Date(new Date(startsAt).getTime() + 90 * 60 * 1000).toISOString();

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error("Session end time must be after start time");
  }

  const attendeeCount = Math.max(1, Math.trunc(Number(input.attendeeCount) || 1));

  let plan: {
    id: string;
    code: string;
    name: string;
    base_price: string;
    max_capacity_per_slot: number;
  } | null = null;

  if (input.planId) {
    const planRes = await client.query<{
      id: string;
      code: string;
      name: string;
      base_price: string;
      max_capacity_per_slot: number;
    }>(
      `SELECT id::text AS id, code, name, base_price::text AS base_price, max_capacity_per_slot
       FROM gym_plans
       WHERE id = $1::uuid AND is_active = true`,
      [input.planId],
    );
    plan = planRes.rows[0] ?? null;
  }

  // Auto-resolve active membership if membershipId passed or member has an active subscription
  let activeMembership: {
    id: string;
    plan_id: string;
    sessions_total: number | null;
    sessions_used: number;
  } | null = null;

  if (input.membershipId) {
    const subRes = await client.query<{
      id: string;
      plan_id: string;
      sessions_total: number | null;
      sessions_used: number;
    }>(
      `SELECT id::text AS id, plan_id::text AS plan_id, sessions_total, sessions_used
       FROM gym_memberships
       WHERE id = $1::uuid
         AND member_id = $2::uuid
         AND status = 'active'
         AND start_date <= $3::date
         AND end_date >= $3::date
         AND (sessions_total IS NULL OR sessions_used < sessions_total)
       FOR UPDATE`,
      [input.membershipId, input.memberId, sessionDate],
    );
    activeMembership = subRes.rows[0] ?? null;
    if (!activeMembership) {
      throw new Error("Selected membership is not active or has no remaining sessions for this date");
    }
  } else if (!input.planId) {
    // Check if member has an active unlimited/remaining membership automatically
    const autoSub = await client.query<{
      id: string;
      plan_id: string;
      sessions_total: number | null;
      sessions_used: number;
    }>(
      `SELECT id::text AS id, plan_id::text AS plan_id, sessions_total, sessions_used
       FROM gym_memberships
       WHERE member_id = $1::uuid
         AND status = 'active'
         AND start_date <= $2::date
         AND end_date >= $2::date
         AND (sessions_total IS NULL OR sessions_used < sessions_total)
       ORDER BY end_date DESC
       LIMIT 1
       FOR UPDATE`,
      [input.memberId, sessionDate],
    );
    activeMembership = autoSub.rows[0] ?? null;
  }

  if (!plan && activeMembership?.plan_id) {
    const planRes = await client.query<{
      id: string;
      code: string;
      name: string;
      base_price: string;
      max_capacity_per_slot: number;
    }>(
      `SELECT id::text AS id, code, name, base_price::text AS base_price, max_capacity_per_slot
       FROM gym_plans WHERE id = $1::uuid`,
      [activeMembership.plan_id],
    );
    plan = planRes.rows[0] ?? null;
  }

  if (!plan) {
    const fallbackPlan = await client.query<{
      id: string;
      code: string;
      name: string;
      base_price: string;
      max_capacity_per_slot: number;
    }>(
      `SELECT id::text AS id, code, name, base_price::text AS base_price, max_capacity_per_slot
       FROM gym_plans
       WHERE is_active = true
       ORDER BY CASE WHEN code = 'GYM-WALKIN-SESSION' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`,
    );
    plan = fallbackPlan.rows[0] ?? null;
  }

  const maxCapacity = Math.max(1, Number(plan?.max_capacity_per_slot ?? 30));
  const overlapRes = await client.query<{ booked: string }>(
    `SELECT COALESCE(SUM(attendee_count), 0)::text AS booked
     FROM gym_bookings
     WHERE status IN ('booked', 'confirmed', 'checked_in')
       AND starts_at < $1::timestamptz
       AND ends_at > $2::timestamptz`,
    [endsAt, startsAt],
  );
  const currentBooked = Number(overlapRes.rows[0]?.booked ?? 0);
  if (currentBooked + attendeeCount > maxCapacity) {
    throw new Error(
      `Selected time slot is at capacity (${currentBooked}/${maxCapacity} spots booked)`,
    );
  }

  const reservationUuid =
    input.reservationId && /^[0-9a-f-]{36}$/i.test(input.reservationId.trim())
      ? input.reservationId.trim()
      : null;

  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let total = 0;
  let paymentStatus = "unpaid";
  let financeStatus = "invoice_posted";
  let bookingStatus = "booked";

  if (activeMembership) {
    paymentStatus = "covered_by_membership";
    financeStatus = "not_required";
    bookingStatus = "confirmed";
  } else if (plan?.code === "GYM-HOTEL-COMP" || Number(plan?.base_price ?? 0) === 0) {
    if (plan?.code === "GYM-HOTEL-COMP" && reservationUuid) {
      const checkedIn = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM reservations WHERE id = $1::uuid AND status = 'checked_in'`,
        [reservationUuid],
      ).catch(() => ({ rows: [] as Array<{ id: string }> }));
      if (!checkedIn.rows[0]) {
        throw new Error("Complimentary hotel pass requires an active checked-in reservation");
      }
    }
    paymentStatus = "complimentary_hotel_guest";
    financeStatus = "not_required";
    bookingStatus = "confirmed";
  } else {
    const grossBase = roundMoney((Number(plan?.base_price ?? 50) || 50) * attendeeCount);
    discount = Math.min(grossBase, Math.max(0, Number(input.discountAmount) || 0));
    const netBeforeTax = roundMoney(grossBase - discount);
    const taxCalc = calculateTaxes(
      netBeforeTax,
      input.taxConfig ?? defaultTaxConfiguration,
      "gym",
    );
    subtotal = taxCalc.subtotal;
    tax = taxCalc.tax;
    total = taxCalc.total;
  }

  const bookingNumber = await generateGymReferenceNumber(
    client,
    "GYM-BK",
    "gym_bookings",
    "booking_number",
  );

  const inserted = await client.query<Record<string, unknown>>(
    `INSERT INTO gym_bookings (
       booking_number, member_id, membership_id, plan_id, reservation_id, trainer_name,
       session_date, starts_at, ends_at, attendee_count, status,
       subtotal, discount_amount, tax_amount, total_invoiced, total_paid, balance_due,
       payment_status, finance_status, notes, created_by
     )
     VALUES (
       $1::varchar, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::varchar,
       $7::date, $8::timestamptz, $9::timestamptz, $10::int, $11::varchar,
       $12::numeric, $13::numeric, $14::numeric, $15::numeric, 0, $16::numeric,
       $17::varchar, $18::varchar, $19::text, $20::varchar
     )
     RETURNING *`,
    [
      bookingNumber,
      input.memberId,
      activeMembership?.id ?? null,
      plan?.id ?? null,
      reservationUuid,
      input.trainerName?.trim() || null,
      sessionDate,
      startsAt,
      endsAt,
      attendeeCount,
      bookingStatus,
      subtotal,
      discount,
      tax,
      total,
      total,
      paymentStatus,
      financeStatus,
      input.notes?.trim() || null,
      input.actor.id,
    ],
  );

  return {
    booking: inserted.rows[0],
    plan,
    coveredByMembership: Boolean(activeMembership),
  };
}

export async function transitionGymBookingStatusTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    bookingId: string;
    action: "check_in" | "check_out" | "cancel" | "no_show";
    reason?: string | null;
    allowUnpaidCheckIn?: boolean;
    actor: GymActor;
  },
) {
  const locked = await client.query<{
    id: string;
    booking_number: string;
    membership_id: string | null;
    status: string;
    payment_status: string;
    balance_due: string;
    attendee_count: number;
  }>(
    `SELECT id::text AS id, booking_number, membership_id::text AS membership_id,
            status, payment_status, balance_due::text AS balance_due, attendee_count
     FROM gym_bookings
     WHERE id = $1::uuid
     FOR UPDATE`,
    [input.bookingId],
  );
  const booking = locked.rows[0];
  if (!booking) throw new Error("Gym booking not found");

  if (input.action === "check_in") {
    if (booking.status === "cancelled" || booking.status === "completed") {
      throw new Error(`Cannot check in a ${booking.status} booking`);
    }
    const balance = Number(booking.balance_due) || 0;
    if (
      balance > 0.01 &&
      !input.allowUnpaidCheckIn &&
      booking.payment_status !== "covered_by_membership" &&
      booking.payment_status !== "complimentary_hotel_guest" &&
      booking.payment_status !== "charged_to_room"
    ) {
      throw new Error(
        `Outstanding balance of GHS ${balance.toFixed(2)} must be settled or charged to a hotel room before check-in`,
      );
    }

    if (booking.membership_id && booking.status !== "checked_in") {
      await client.query(
        `UPDATE gym_memberships
         SET sessions_used = sessions_used + $2::int,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [booking.membership_id, Math.max(1, Number(booking.attendee_count) || 1)],
      );
    }

    const updated = await client.query<Record<string, unknown>>(
      `UPDATE gym_bookings
       SET status = 'checked_in',
           check_in_at = COALESCE(check_in_at, CURRENT_TIMESTAMP),
           checked_in_by = $2::varchar,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [input.bookingId, input.actor.id],
    );

    // Award +1 workforce performance point to operational staff who check in a gym guest
    if (input.actor.id && input.actor.role !== "admin") {
      const exec: GymQueryExecutor = async <R = Record<string, unknown>>(
        text: string,
        params?: unknown[],
      ) => {
        const res = await client.query(text, params as unknown[]);
        return { rows: res.rows as unknown as R[], rowCount: res.rowCount };
      };
      await recordWorkforcePerformanceEvent(
        {
          staffOrUserId: input.actor.id,
          sourceType: "gym_session_checkin",
          sourceId: booking.id,
          points: 1,
          category: "gym_operations",
          reason: `Checked in Gym session (${booking.booking_number})`,
        },
        exec,
      ).catch(() => undefined);
    }

    return updated.rows[0];
  }

  if (input.action === "check_out") {
    if (booking.status !== "checked_in" && booking.status !== "confirmed") {
      throw new Error("Only checked-in or confirmed sessions can be checked out");
    }
    const updated = await client.query<Record<string, unknown>>(
      `UPDATE gym_bookings
       SET status = 'completed',
           check_out_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [input.bookingId],
    );
    return updated.rows[0];
  }

  if (input.action === "no_show") {
    const updated = await client.query<Record<string, unknown>>(
      `UPDATE gym_bookings
       SET status = 'no_show',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [input.bookingId],
    );
    return updated.rows[0];
  }

  // Cancel
  if (booking.status === "completed") {
    throw new Error("Completed gym sessions cannot be cancelled");
  }
  const updated = await client.query<Record<string, unknown>>(
    `UPDATE gym_bookings
     SET status = 'cancelled',
         cancelled_at = CURRENT_TIMESTAMP,
         cancelled_by = $2::varchar,
         cancellation_reason = $3::text,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
     RETURNING *`,
    [input.bookingId, input.actor.id, input.reason?.trim() || "Cancelled by staff"],
  );
  return updated.rows[0];
}

export async function processGymPaymentTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    bookingId?: string | null;
    membershipId?: string | null;
    amount?: number;
    method: string;
    providerReference?: string | null;
    reservationId?: string | null;
    idempotencyKey?: string | null;
    requireFinanceVerification?: boolean;
    notes?: string | null;
    actor: GymActor;
  },
) {
  const method = normalizeGymPaymentMethod(input.method);
  if (!method) {
    throw new Error(
      `Unsupported payment method '${input.method}'. Use cash, card, mobile_money, bank_transfer, or room_charge.`,
    );
  }

  if (!input.bookingId && !input.membershipId) {
    throw new Error("Either bookingId or membershipId is required to record a gym payment");
  }

  const idemKey =
    String(input.idempotencyKey ?? "").trim() ||
    `gym-pay:${input.bookingId || input.membershipId}:${Date.now()}`;

  // Idempotent replay check
  const existingPay = await client.query<Record<string, unknown>>(
    `SELECT * FROM gym_payments WHERE idempotency_key = $1::varchar LIMIT 1`,
    [idemKey],
  );
  if (existingPay.rows[0]) {
    return {
      payment: existingPay.rows[0],
      replayed: true,
      requiresFinanceApproval:
        existingPay.rows[0].verification_status === "pending_verification",
    };
  }

  let targetType: "gym_booking" | "gym_membership" = "gym_booking";
  let targetId = "";
  let referenceCode = "";
  let memberId = "";
  let customerName = "Gym Guest";
  let itemLabel = "Gym Fitness Session";
  let subtotal = 0;
  let taxAmount = 0;
  let discountAmount = 0;
  let totalInvoiced = 0;
  let currentPaid = 0;
  let currentBalance = 0;
  let bookingReservationId: string | null = input.reservationId?.trim() || null;

  if (input.bookingId) {
    targetType = "gym_booking";
    const bkRes = await client.query<{
      id: string;
      booking_number: string;
      member_id: string;
      reservation_id: string | null;
      subtotal: string;
      tax_amount: string;
      discount_amount: string;
      total_invoiced: string;
      total_paid: string;
      balance_due: string;
      first_name: string;
      last_name: string;
      plan_name: string | null;
    }>(
      `SELECT b.id::text AS id, b.booking_number, b.member_id::text AS member_id,
              b.reservation_id::text AS reservation_id,
              b.subtotal::text AS subtotal, b.tax_amount::text AS tax_amount,
              b.discount_amount::text AS discount_amount,
              b.total_invoiced::text AS total_invoiced,
              b.total_paid::text AS total_paid,
              b.balance_due::text AS balance_due,
              m.first_name, m.last_name,
              p.name AS plan_name
       FROM gym_bookings b
       JOIN gym_members m ON m.id = b.member_id
       LEFT JOIN gym_plans p ON p.id = b.plan_id
       WHERE b.id = $1::uuid
       FOR UPDATE OF b`,
      [input.bookingId],
    );
    const bk = bkRes.rows[0];
    if (!bk) throw new Error("Gym booking not found");
    targetId = bk.id;
    referenceCode = bk.booking_number;
    memberId = bk.member_id;
    customerName = `${bk.first_name} ${bk.last_name}`.trim();
    itemLabel = bk.plan_name || "Gym Workout Session";
    subtotal = Number(bk.subtotal) || 0;
    taxAmount = Number(bk.tax_amount) || 0;
    discountAmount = Number(bk.discount_amount) || 0;
    totalInvoiced = Number(bk.total_invoiced) || 0;
    currentPaid = Number(bk.total_paid) || 0;
    currentBalance = Number(bk.balance_due) || 0;
    if (!bookingReservationId && bk.reservation_id) {
      bookingReservationId = bk.reservation_id;
    }
  } else if (input.membershipId) {
    targetType = "gym_membership";
    const subRes = await client.query<{
      id: string;
      membership_number: string;
      member_id: string;
      subtotal: string;
      tax_amount: string;
      discount_amount: string;
      total_invoiced: string;
      total_paid: string;
      balance_due: string;
      first_name: string;
      last_name: string;
      plan_name: string | null;
    }>(
      `SELECT ms.id::text AS id, ms.membership_number, ms.member_id::text AS member_id,
              ms.subtotal::text AS subtotal, ms.tax_amount::text AS tax_amount,
              ms.discount_amount::text AS discount_amount,
              ms.total_invoiced::text AS total_invoiced,
              ms.total_paid::text AS total_paid,
              ms.balance_due::text AS balance_due,
              m.first_name, m.last_name,
              p.name AS plan_name
       FROM gym_memberships ms
       JOIN gym_members m ON m.id = ms.member_id
       LEFT JOIN gym_plans p ON p.id = ms.plan_id
       WHERE ms.id = $1::uuid
       FOR UPDATE OF ms`,
      [input.membershipId],
    );
    const ms = subRes.rows[0];
    if (!ms) throw new Error("Gym membership subscription not found");
    targetId = ms.id;
    referenceCode = ms.membership_number;
    memberId = ms.member_id;
    customerName = `${ms.first_name} ${ms.last_name}`.trim();
    itemLabel = ms.plan_name || "Gym Membership Subscription";
    subtotal = Number(ms.subtotal) || 0;
    taxAmount = Number(ms.tax_amount) || 0;
    discountAmount = Number(ms.discount_amount) || 0;
    totalInvoiced = Number(ms.total_invoiced) || 0;
    currentPaid = Number(ms.total_paid) || 0;
    currentBalance = Number(ms.balance_due) || 0;
  }

  if (currentBalance <= 0.005) {
    throw new Error(`${referenceCode} is already settled in full`);
  }

  const payAmount = roundMoney(
    input.amount !== undefined && input.amount !== null && Number(input.amount) > 0
      ? Number(input.amount)
      : currentBalance,
  );

  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }
  if (payAmount > roundMoney(currentBalance + 0.01)) {
    throw new Error(
      `Payment amount (GHS ${payAmount.toFixed(2)}) exceeds balance due (GHS ${currentBalance.toFixed(2)})`,
    );
  }

  const paymentReference = await generateGymReferenceNumber(
    client,
    "GYM-PAY",
    "gym_payments",
    "payment_reference",
  );

  const actorMeta = {
    id: input.actor.id,
    name: input.actor.name ?? null,
    accountName: input.actor.name ?? input.actor.email ?? input.actor.id,
    email: input.actor.email ?? null,
    role: input.actor.role ?? null,
  };

  // Path 1: Charge to checked-in Hotel Guest Room Folio
  if (method === "room_charge") {
    if (!bookingReservationId || !/^[0-9a-f-]{36}$/i.test(bookingReservationId)) {
      throw new Error(
        "A checked-in hotel reservation must be selected to charge Gym fees to a room folio",
      );
    }
    const resLock = await client.query<{ id: string; status: string }>(
      `SELECT id::text AS id, status FROM reservations WHERE id = $1::uuid FOR UPDATE`,
      [bookingReservationId],
    );
    if (!resLock.rows[0] || resLock.rows[0].status !== "checked_in") {
      throw new Error("Selected hotel reservation is not currently checked in");
    }
    const folioLock = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM guest_folios WHERE reservation_id = $1::uuid FOR UPDATE`,
      [bookingReservationId],
    );
    if (!folioLock.rows[0]) {
      throw new Error("Guest folio was not found for the selected reservation");
    }
    const folioId = folioLock.rows[0].id;

    await client.query(
      `INSERT INTO guest_folio_items (
         folio_id, category, description, quantity, unit_amount, total_amount, created_by
       )
       VALUES ($1::uuid, 'service', $2::varchar, 1, $3::numeric, $3::numeric, $4::uuid)`,
      [
        folioId,
        `Gym & Fitness: ${itemLabel} (${referenceCode})`,
        payAmount,
        /^[0-9a-f-]{36}$/i.test(input.actor.id) ? input.actor.id : null,
      ],
    );

    await client.query(
      `UPDATE guest_folios
       SET service_charges = COALESCE(service_charges, 0) + $1::numeric,
           total_charges = COALESCE(total_charges, 0) + $1::numeric,
           balance = COALESCE(balance, 0) + $1::numeric,
           last_updated = CURRENT_TIMESTAMP
       WHERE id = $2::uuid`,
      [payAmount, folioId],
    );

    const receiptId = await persistGymCanonicalReceiptOnClient(client, {
      entityId: targetId,
      receiptNumber: referenceCode,
      customerName,
      paymentMethod: "Room Folio Charge",
      subtotal,
      tax: taxAmount,
      total: totalInvoiced,
      discountAmount,
      items: [{ id: targetId, name: itemLabel, price: subtotal || payAmount, quantity: 1 }],
      actor: input.actor,
      orderType: targetType === "gym_membership" ? "gym membership" : "gym session",
    });

    const newPaid = roundMoney(currentPaid + payAmount);
    const newBalance = Math.max(0, roundMoney(totalInvoiced - newPaid));

    if (targetType === "gym_booking") {
      await client.query(
        `UPDATE gym_bookings
         SET reservation_id = $2::uuid,
             total_paid = $3::numeric,
             balance_due = $4::numeric,
             payment_status = CASE WHEN $4::numeric <= 0.005 THEN 'charged_to_room' ELSE 'partially_paid' END,
             finance_status = 'settled',
             status = CASE WHEN status = 'booked' AND $4::numeric <= 0.005 THEN 'confirmed' ELSE status END,
             receipt_id = COALESCE($5::uuid, receipt_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [targetId, bookingReservationId, newPaid, newBalance, receiptId],
      );
    } else {
      await client.query(
        `UPDATE gym_memberships
         SET total_paid = $2::numeric,
             balance_due = $3::numeric,
             status = CASE WHEN $3::numeric <= 0.005 THEN 'active' ELSE status END,
             finance_status = CASE WHEN $3::numeric <= 0.005 THEN 'settled' ELSE 'partially_paid' END,
             receipt_id = COALESCE($4::uuid, receipt_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [targetId, newPaid, newBalance, receiptId],
      );
    }

    const payInsert = await client.query<Record<string, unknown>>(
      `INSERT INTO gym_payments (
         payment_reference, booking_id, membership_id, member_id, amount, currency,
         method, provider_reference, idempotency_key, status, verification_status,
         recorded_by, recorded_by_name, finance_note, receipt_id
       )
       VALUES (
         $1::varchar, $2::uuid, $3::uuid, $4::uuid, $5::numeric, 'GHS',
         'room_charge', $6::varchar, $7::varchar, 'completed', 'pending_reconciliation',
         $8::varchar, $9::varchar, $10::text, $11::uuid
       )
       RETURNING *`,
      [
        paymentReference,
        input.bookingId || null,
        input.membershipId || null,
        memberId,
        payAmount,
        bookingReservationId,
        idemKey,
        input.actor.id,
        actorMeta.accountName,
        input.notes?.trim() || "Posted to checked-in hotel guest folio",
        receiptId,
      ],
    );

    return {
      payment: payInsert.rows[0],
      replayed: false,
      requiresFinanceApproval: false,
      chargedToRoomFolio: true,
      receiptNumber: referenceCode,
    };
  }

  // Path 2: Deferred / Bank Transfer requiring Finance Department Verification before posting revenue
  const requiresVerification =
    method === "bank_transfer" || Boolean(input.requireFinanceVerification);
  const ledgerEventKey = `gym-payment:${paymentReference}`;
  const classification = financeClassificationMetadata("gym_payment", "Gym & Fitness");
  const ledgerMetadata = {
    ...classification,
    source: "gym_payment",
    orderNumber: referenceCode,
    paymentReference,
    customerName,
    memberId,
    bookingId: input.bookingId ?? null,
    membershipId: input.membershipId ?? null,
    providerReference: input.providerReference?.trim() || null,
    performedBy: actorMeta,
  };

  if (requiresVerification) {
    const ledgerRes = await client.query<{ id: string }>(
      `INSERT INTO canonical_financial_ledger (
         event_key, amount, currency, direction, status, source, payment_method,
         entity_type, entity_id, journal_type, source_event_id, metadata, occurred_at
       )
       VALUES (
         $1::varchar, $2::numeric, 'GHS', 'credit', 'pending', 'gym_payment', $3::varchar,
         $4::varchar, $5::varchar, 'operational', $6::varchar, $7::jsonb, CURRENT_TIMESTAMP
       )
       ON CONFLICT (event_key) DO NOTHING
       RETURNING id::text AS id`,
      [ledgerEventKey, payAmount, method, targetType, targetId, idemKey, JSON.stringify(ledgerMetadata)],
    );

    const payInsert = await client.query<Record<string, unknown>>(
      `INSERT INTO gym_payments (
         payment_reference, booking_id, membership_id, member_id, amount, currency,
         method, provider_reference, idempotency_key, status, verification_status,
         recorded_by, recorded_by_name, finance_note, ledger_entry_id
       )
       VALUES (
         $1::varchar, $2::uuid, $3::uuid, $4::uuid, $5::numeric, 'GHS',
         $6::varchar, $7::varchar, $8::varchar, 'pending', 'pending_verification',
         $9::varchar, $10::varchar, $11::text, $12::varchar
       )
       RETURNING *`,
      [
        paymentReference,
        input.bookingId || null,
        input.membershipId || null,
        memberId,
        payAmount,
        method,
        input.providerReference?.trim() || null,
        idemKey,
        input.actor.id,
        actorMeta.accountName,
        input.notes?.trim() || "Awaiting Finance Department bank/transfer verification",
        ledgerRes.rows[0]?.id ?? ledgerEventKey,
      ],
    );

    if (targetType === "gym_booking") {
      await client.query(
        `UPDATE gym_bookings
         SET payment_status = 'pending_finance_verification',
             finance_status = 'pending_verification',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [targetId],
      );
    } else {
      await client.query(
        `UPDATE gym_memberships
         SET finance_status = 'pending_verification',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [targetId],
      );
    }

    return {
      payment: payInsert.rows[0],
      replayed: false,
      requiresFinanceApproval: true,
      receiptNumber: referenceCode,
      customerName,
    };
  }

  // Path 3: Immediate Desk Settlement (cash, card, mobile_money) -> Posted to Finance Ledger + Receipt + Reconciliation Queue
  const ledgerRes = await client.query<{ id: string }>(
    `INSERT INTO canonical_financial_ledger (
       event_key, amount, currency, direction, status, source, payment_method,
       entity_type, entity_id, journal_type, source_event_id, metadata, occurred_at
     )
     VALUES (
       $1::varchar, $2::numeric, 'GHS', 'credit', 'posted', 'gym_payment', $3::varchar,
       $4::varchar, $5::varchar, 'operational', $6::varchar, $7::jsonb, CURRENT_TIMESTAMP
     )
     ON CONFLICT (event_key) DO NOTHING
     RETURNING id::text AS id`,
    [ledgerEventKey, payAmount, method, targetType, targetId, idemKey, JSON.stringify(ledgerMetadata)],
  );

  await insertTransactionLogSafe(client, {
    transactionId: paymentReference,
    amount: payAmount,
    status: "completed",
    paymentMethod: method,
    customerId: memberId,
    items: [{ id: targetId, name: itemLabel, price: subtotal || payAmount, quantity: 1 }],
    metadata: ledgerMetadata,
  });

  const receiptId = await persistGymCanonicalReceiptOnClient(client, {
    entityId: targetId,
    receiptNumber: referenceCode,
    customerName,
    paymentMethod: method.replace("_", " "),
    subtotal,
    tax: taxAmount,
    total: totalInvoiced,
    discountAmount,
    items: [{ id: targetId, name: itemLabel, price: subtotal || payAmount, quantity: 1 }],
    actor: input.actor,
    orderType: targetType === "gym_membership" ? "gym membership" : "gym session",
  });

  const newPaid = roundMoney(currentPaid + payAmount);
  const newBalance = Math.max(0, roundMoney(totalInvoiced - newPaid));
  const fullySettled = newBalance <= 0.005;

  if (targetType === "gym_booking") {
    await client.query(
      `UPDATE gym_bookings
       SET total_paid = $2::numeric,
           balance_due = $3::numeric,
           payment_status = $4::varchar,
           finance_status = $5::varchar,
           status = CASE WHEN status = 'booked' AND $6::boolean THEN 'confirmed' ELSE status END,
           receipt_id = COALESCE($7::uuid, receipt_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      [
        targetId,
        newPaid,
        newBalance,
        fullySettled ? "paid" : "partially_paid",
        fullySettled ? "settled" : "invoice_posted",
        fullySettled,
        receiptId,
      ],
    );
  } else {
    await client.query(
      `UPDATE gym_memberships
       SET total_paid = $2::numeric,
           balance_due = $3::numeric,
           status = CASE WHEN $4::boolean THEN 'active' ELSE status END,
           finance_status = $5::varchar,
           receipt_id = COALESCE($6::uuid, receipt_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      [
        targetId,
        newPaid,
        newBalance,
        fullySettled,
        fullySettled ? "settled" : "partially_paid",
        receiptId,
      ],
    );
  }

  const payInsert = await client.query<Record<string, unknown>>(
    `INSERT INTO gym_payments (
       payment_reference, booking_id, membership_id, member_id, amount, currency,
       method, provider_reference, idempotency_key, status, verification_status,
       recorded_by, recorded_by_name, finance_note, ledger_entry_id, receipt_id
     )
     VALUES (
       $1::varchar, $2::uuid, $3::uuid, $4::uuid, $5::numeric, 'GHS',
       $6::varchar, $7::varchar, $8::varchar, 'completed', 'pending_reconciliation',
       $9::varchar, $10::varchar, $11::text, $12::varchar, $13::uuid
     )
     RETURNING *`,
    [
      paymentReference,
      input.bookingId || null,
      input.membershipId || null,
      memberId,
      payAmount,
      method,
      input.providerReference?.trim() || null,
      idemKey,
      input.actor.id,
      actorMeta.accountName,
      input.notes?.trim() || null,
      ledgerRes.rows[0]?.id ?? ledgerEventKey,
      receiptId,
    ],
  );

  return {
    payment: payInsert.rows[0],
    replayed: false,
    requiresFinanceApproval: false,
    receiptNumber: referenceCode,
    customerName,
  };
}

export async function reviewGymPaymentByFinanceTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    paymentId: string;
    action: "approve_and_post" | "reconcile" | "reject";
    financeNote?: string | null;
    actor: GymActor;
  },
) {
  const payLock = await client.query<{
    id: string;
    payment_reference: string;
    booking_id: string | null;
    membership_id: string | null;
    member_id: string;
    amount: string;
    method: string;
    status: string;
    verification_status: string;
  }>(
    `SELECT id::text AS id, payment_reference, booking_id::text AS booking_id,
            membership_id::text AS membership_id, member_id::text AS member_id,
            amount::text AS amount, method, status, verification_status
     FROM gym_payments
     WHERE id = $1::uuid
     FOR UPDATE`,
    [input.paymentId],
  );
  const payment = payLock.rows[0];
  if (!payment) throw new Error("Gym payment record not found");

  const approverMeta = {
    id: input.actor.id,
    name: input.actor.name ?? null,
    accountName: input.actor.name ?? input.actor.email ?? input.actor.id,
    email: input.actor.email ?? null,
    role: input.actor.role ?? null,
  };
  const ledgerEventKey = `gym-payment:${payment.payment_reference}`;
  const payAmount = Number(payment.amount) || 0;

  if (input.action === "reject") {
    if (payment.status === "completed") {
      throw new Error("Completed payments must be refunded via the Finance Refund workflow rather than rejected");
    }
    const updated = await client.query<Record<string, unknown>>(
      `UPDATE gym_payments
       SET status = 'reversed',
           verification_status = 'rejected',
           verified_by = $2::varchar,
           verified_by_name = $3::varchar,
           verified_at = CURRENT_TIMESTAMP,
           finance_note = $4::text,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [input.paymentId, input.actor.id, approverMeta.accountName, input.financeNote?.trim() || "Rejected by Finance"],
    );

    await client.query(
      `UPDATE canonical_financial_ledger
       SET status = 'cancelled',
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approvedBy', $2::jsonb, 'financeNote', $3::text),
           updated_at = CURRENT_TIMESTAMP
       WHERE event_key = $1::varchar`,
      [ledgerEventKey, JSON.stringify(approverMeta), input.financeNote?.trim() || "Rejected by Finance"],
    );

    if (payment.booking_id) {
      await client.query(
        `UPDATE gym_bookings
         SET payment_status = CASE WHEN total_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END,
             finance_status = 'invoice_posted',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [payment.booking_id],
      );
    } else if (payment.membership_id) {
      await client.query(
        `UPDATE gym_memberships
         SET finance_status = CASE WHEN total_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [payment.membership_id],
      );
    }

    return updated.rows[0];
  }

  if (input.action === "reconcile") {
    const updated = await client.query<Record<string, unknown>>(
      `UPDATE gym_payments
       SET verification_status = 'verified_by_finance',
           verified_by = $2::varchar,
           verified_by_name = $3::varchar,
           verified_at = CURRENT_TIMESTAMP,
           finance_note = COALESCE($4::text, finance_note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [input.paymentId, input.actor.id, approverMeta.accountName, input.financeNote?.trim() || null],
    );

    await client.query(
      `UPDATE canonical_financial_ledger
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approvedBy', $2::jsonb, 'reconciledAt', CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE event_key = $1::varchar`,
      [ledgerEventKey, JSON.stringify(approverMeta)],
    );

    if (payment.booking_id) {
      await client.query(
        `UPDATE gym_bookings
         SET finance_status = 'verified_posted', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid AND balance_due <= 0.005`,
        [payment.booking_id],
      );
    }

    return updated.rows[0];
  }

  // action === "approve_and_post": Approve pending bank transfer / deferred payment & post to Finance Ledger
  if (payment.status === "completed" && payment.verification_status === "verified_by_finance") {
    return payment;
  }

  let referenceCode = payment.payment_reference;
  let customerName = "Gym Member";
  let itemLabel = "Gym Fitness Payment";
  let subtotal = payAmount;
  let taxAmount = 0;
  let totalInvoiced = payAmount;
  const targetId = payment.booking_id || payment.membership_id || payment.id;

  if (payment.booking_id) {
    const bkRes = await client.query<{
      booking_number: string;
      subtotal: string;
      tax_amount: string;
      total_invoiced: string;
      total_paid: string;
      first_name: string;
      last_name: string;
      plan_name: string | null;
    }>(
      `SELECT b.booking_number, b.subtotal::text AS subtotal, b.tax_amount::text AS tax_amount,
              b.total_invoiced::text AS total_invoiced, b.total_paid::text AS total_paid,
              m.first_name, m.last_name, p.name AS plan_name
       FROM gym_bookings b
       JOIN gym_members m ON m.id = b.member_id
       LEFT JOIN gym_plans p ON p.id = b.plan_id
       WHERE b.id = $1::uuid
       FOR UPDATE OF b`,
      [payment.booking_id],
    );
    const bk = bkRes.rows[0];
    if (bk) {
      referenceCode = bk.booking_number;
      customerName = `${bk.first_name} ${bk.last_name}`.trim();
      itemLabel = bk.plan_name || "Gym Workout Session";
      subtotal = Number(bk.subtotal) || payAmount;
      taxAmount = Number(bk.tax_amount) || 0;
      totalInvoiced = Number(bk.total_invoiced) || payAmount;
      const nextPaid = roundMoney((Number(bk.total_paid) || 0) + (payment.status === "pending" ? payAmount : 0));
      const nextBal = Math.max(0, roundMoney(totalInvoiced - nextPaid));
      const settled = nextBal <= 0.005;

      const receiptId = await persistGymCanonicalReceiptOnClient(client, {
        entityId: payment.booking_id,
        receiptNumber: referenceCode,
        customerName,
        paymentMethod: payment.method.replace("_", " "),
        subtotal,
        tax: taxAmount,
        total: totalInvoiced,
        items: [{ id: payment.booking_id, name: itemLabel, price: subtotal, quantity: 1 }],
        actor: input.actor,
        orderType: "gym session",
      });

      await client.query(
        `UPDATE gym_bookings
         SET total_paid = $2::numeric,
             balance_due = $3::numeric,
             payment_status = $4::varchar,
             finance_status = $5::varchar,
             status = CASE WHEN status = 'booked' AND $6::boolean THEN 'confirmed' ELSE status END,
             receipt_id = COALESCE($7::uuid, receipt_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [
          payment.booking_id,
          nextPaid,
          nextBal,
          settled ? "paid" : "partially_paid",
          settled ? "verified_posted" : "invoice_posted",
          settled,
          receiptId,
        ],
      );
    }
  } else if (payment.membership_id) {
    const msRes = await client.query<{
      membership_number: string;
      subtotal: string;
      tax_amount: string;
      total_invoiced: string;
      total_paid: string;
      first_name: string;
      last_name: string;
      plan_name: string | null;
    }>(
      `SELECT ms.membership_number, ms.subtotal::text AS subtotal, ms.tax_amount::text AS tax_amount,
              ms.total_invoiced::text AS total_invoiced, ms.total_paid::text AS total_paid,
              m.first_name, m.last_name, p.name AS plan_name
       FROM gym_memberships ms
       JOIN gym_members m ON m.id = ms.member_id
       LEFT JOIN gym_plans p ON p.id = ms.plan_id
       WHERE ms.id = $1::uuid
       FOR UPDATE OF ms`,
      [payment.membership_id],
    );
    const ms = msRes.rows[0];
    if (ms) {
      referenceCode = ms.membership_number;
      customerName = `${ms.first_name} ${ms.last_name}`.trim();
      itemLabel = ms.plan_name || "Gym Membership Subscription";
      subtotal = Number(ms.subtotal) || payAmount;
      taxAmount = Number(ms.tax_amount) || 0;
      totalInvoiced = Number(ms.total_invoiced) || payAmount;
      const nextPaid = roundMoney((Number(ms.total_paid) || 0) + (payment.status === "pending" ? payAmount : 0));
      const nextBal = Math.max(0, roundMoney(totalInvoiced - nextPaid));
      const settled = nextBal <= 0.005;

      const receiptId = await persistGymCanonicalReceiptOnClient(client, {
        entityId: payment.membership_id,
        receiptNumber: referenceCode,
        customerName,
        paymentMethod: payment.method.replace("_", " "),
        subtotal,
        tax: taxAmount,
        total: totalInvoiced,
        items: [{ id: payment.membership_id, name: itemLabel, price: subtotal, quantity: 1 }],
        actor: input.actor,
        orderType: "gym membership",
      });

      await client.query(
        `UPDATE gym_memberships
         SET total_paid = $2::numeric,
             balance_due = $3::numeric,
             status = CASE WHEN $4::boolean THEN 'active' ELSE status END,
             finance_status = $5::varchar,
             receipt_id = COALESCE($6::uuid, receipt_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        [
          payment.membership_id,
          nextPaid,
          nextBal,
          settled,
          settled ? "settled" : "partially_paid",
          receiptId,
        ],
      );
    }
  }

  const classification = financeClassificationMetadata("gym_payment", "Gym & Fitness");
  await client.query(
    `INSERT INTO canonical_financial_ledger (
       event_key, amount, currency, direction, status, source, payment_method,
       entity_type, entity_id, journal_type, source_event_id, metadata, occurred_at
     )
     VALUES (
       $1::varchar, $2::numeric, 'GHS', 'credit', 'posted', 'gym_payment', $3::varchar,
       $4::varchar, $5::varchar, 'operational', $1::varchar, $6::jsonb, CURRENT_TIMESTAMP
     )
     ON CONFLICT (event_key) DO UPDATE
       SET status = 'posted',
           metadata = COALESCE(canonical_financial_ledger.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = CURRENT_TIMESTAMP`,
    [
      ledgerEventKey,
      payAmount,
      payment.method,
      payment.booking_id ? "gym_booking" : "gym_membership",
      targetId,
      JSON.stringify({
        ...classification,
        source: "gym_payment",
        orderNumber: referenceCode,
        paymentReference: payment.payment_reference,
        customerName,
        approvedBy: approverMeta,
      }),
    ],
  );

  await insertTransactionLogSafe(client, {
    transactionId: payment.payment_reference,
    amount: payAmount,
    status: "completed",
    paymentMethod: payment.method,
    customerId: payment.member_id,
    items: [{ id: targetId, name: itemLabel, price: subtotal, quantity: 1 }],
    metadata: {
      ...classification,
      source: "gym_payment",
      orderNumber: referenceCode,
      customerName,
      approvedBy: approverMeta,
    },
  });

  const updated = await client.query<Record<string, unknown>>(
    `UPDATE gym_payments
     SET status = 'completed',
         verification_status = 'verified_by_finance',
         verified_by = $2::varchar,
         verified_by_name = $3::varchar,
         verified_at = CURRENT_TIMESTAMP,
         finance_note = COALESCE($4::text, finance_note),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
     RETURNING *`,
    [input.paymentId, input.actor.id, approverMeta.accountName, input.financeNote?.trim() || null],
  );

  return updated.rows[0];
}

export async function createGymRefundRequestTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    paymentId: string;
    amount?: number;
    reason: string;
    actor: GymActor;
  },
) {
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) {
    throw new Error("A clear refund reason (at least 5 characters) is required");
  }

  const payRes = await client.query<{
    id: string;
    payment_reference: string;
    booking_id: string | null;
    membership_id: string | null;
    member_id: string;
    amount: string;
    status: string;
  }>(
    `SELECT id::text AS id, payment_reference, booking_id::text AS booking_id,
            membership_id::text AS membership_id, member_id::text AS member_id,
            amount::text AS amount, status
     FROM gym_payments
     WHERE id = $1::uuid
     FOR UPDATE`,
    [input.paymentId],
  );
  const payment = payRes.rows[0];
  if (!payment) throw new Error("Gym payment not found");
  if (payment.status !== "completed") {
    throw new Error("Only completed Gym payments can be submitted for refund");
  }

  const maxRefundable = Number(payment.amount) || 0;
  const reqAmount = roundMoney(
    input.amount !== undefined && input.amount !== null && Number(input.amount) > 0
      ? Number(input.amount)
      : maxRefundable,
  );
  if (reqAmount <= 0 || reqAmount > roundMoney(maxRefundable + 0.01)) {
    throw new Error(`Refund amount must be between GHS 0.01 and GHS ${maxRefundable.toFixed(2)}`);
  }

  const existingPending = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM gym_refund_requests
     WHERE payment_id = $1::uuid AND status = 'pending_finance_approval'
     LIMIT 1`,
    [input.paymentId],
  );
  if (existingPending.rows[0]) {
    throw new Error("A refund request for this payment is already awaiting Finance approval");
  }

  const refundNumber = await generateGymReferenceNumber(
    client,
    "GYM-REF",
    "gym_refund_requests",
    "refund_number",
  );

  const inserted = await client.query<Record<string, unknown>>(
    `INSERT INTO gym_refund_requests (
       refund_number, booking_id, membership_id, payment_id, member_id,
       amount, currency, reason, status, requested_by, requested_by_name
     )
     VALUES (
       $1::varchar, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
       $6::numeric, 'GHS', $7::text, 'pending_finance_approval', $8::varchar, $9::varchar
     )
     RETURNING *`,
    [
      refundNumber,
      payment.booking_id,
      payment.membership_id,
      payment.id,
      payment.member_id,
      reqAmount,
      reason,
      input.actor.id,
      input.actor.name ?? input.actor.email ?? input.actor.id,
    ],
  );

  if (payment.booking_id) {
    await client.query(
      `UPDATE gym_bookings SET finance_status = 'refund_pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      [payment.booking_id],
    );
  }

  return inserted.rows[0];
}

export async function reviewGymRefundByFinanceTx(
  client: Pick<DatabaseClient, "query">,
  input: {
    refundId: string;
    action: "approve" | "reject";
    rejectionReason?: string | null;
    actor: GymActor;
  },
) {
  const refLock = await client.query<{
    id: string;
    refund_number: string;
    booking_id: string | null;
    membership_id: string | null;
    payment_id: string;
    member_id: string;
    amount: string;
    reason: string;
    status: string;
  }>(
    `SELECT id::text AS id, refund_number, booking_id::text AS booking_id,
            membership_id::text AS membership_id, payment_id::text AS payment_id,
            member_id::text AS member_id, amount::text AS amount, reason, status
     FROM gym_refund_requests
     WHERE id = $1::uuid
     FOR UPDATE`,
    [input.refundId],
  );
  const refund = refLock.rows[0];
  if (!refund) throw new Error("Gym refund request not found");
  if (refund.status !== "pending_finance_approval") {
    throw new Error(`Refund request is already ${refund.status}`);
  }

  const approverName = input.actor.name ?? input.actor.email ?? input.actor.id;

  if (input.action === "reject") {
    const updated = await client.query<Record<string, unknown>>(
      `UPDATE gym_refund_requests
       SET status = 'rejected',
           approved_by = $2::varchar,
           approved_by_name = $3::varchar,
           approved_at = CURRENT_TIMESTAMP,
           rejection_reason = $4::text,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [
        input.refundId,
        input.actor.id,
        approverName,
        input.rejectionReason?.trim() || "Rejected by Finance Department",
      ],
    );
    if (refund.booking_id) {
      await client.query(
        `UPDATE gym_bookings SET finance_status = 'settled', updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
        [refund.booking_id],
      );
    }
    return updated.rows[0];
  }

  // Approve refund -> Debit reversal in canonical_financial_ledger
  const payRes = await client.query<{
    payment_reference: string;
    method: string;
    ledger_entry_id: string | null;
    amount: string;
  }>(
    `SELECT payment_reference, method, ledger_entry_id, amount::text AS amount
     FROM gym_payments
     WHERE id = $1::uuid
     FOR UPDATE`,
    [refund.payment_id],
  );
  const payment = payRes.rows[0];
  const refundAmount = Number(refund.amount) || 0;
  const ledgerEventKey = `gym-refund:${refund.refund_number}`;
  const classification = financeClassificationMetadata("gym_refund", "Gym & Fitness");

  const ledgerInsert = await client.query<{ id: string }>(
    `INSERT INTO canonical_financial_ledger (
       event_key, amount, currency, direction, status, source, payment_method,
       entity_type, entity_id, original_entry_id, journal_type, source_event_id, metadata, occurred_at
     )
     VALUES (
       $1::varchar, $2::numeric, 'GHS', 'debit', 'posted', 'gym_refund', $3::varchar,
       $4::varchar, $5::varchar, $6::varchar, 'refund', $7::varchar, $8::jsonb, CURRENT_TIMESTAMP
     )
     ON CONFLICT (event_key) DO NOTHING
     RETURNING id::text AS id`,
    [
      ledgerEventKey,
      refundAmount,
      payment?.method ?? "cash",
      refund.booking_id ? "gym_booking" : "gym_membership",
      refund.booking_id || refund.membership_id || refund.payment_id,
      payment?.ledger_entry_id ?? `gym-payment:${payment?.payment_reference ?? refund.payment_id}`,
      refund.id,
      JSON.stringify({
        ...classification,
        source: "gym_refund",
        refundNumber: refund.refund_number,
        originalPaymentReference: payment?.payment_reference ?? null,
        reason: refund.reason,
        approvedBy: {
          id: input.actor.id,
          name: input.actor.name ?? null,
          accountName: approverName,
          email: input.actor.email ?? null,
          role: input.actor.role ?? null,
        },
      }),
    ],
  );

  await client.query(
    `UPDATE gym_payments
     SET status = 'refunded',
         verification_status = 'reversed',
         reversed_by = $2::varchar,
         reversed_at = CURRENT_TIMESTAMP,
         reversal_reason = $3::text,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [refund.payment_id, input.actor.id, refund.reason],
  );

  if (refund.booking_id) {
    await client.query(
      `UPDATE gym_bookings
       SET total_paid = GREATEST(0, total_paid - $2::numeric),
           payment_status = 'refunded',
           finance_status = 'refunded',
           status = CASE WHEN status IN ('booked', 'confirmed') THEN 'cancelled' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      [refund.booking_id, refundAmount],
    );
  } else if (refund.membership_id) {
    await client.query(
      `UPDATE gym_memberships
       SET total_paid = GREATEST(0, total_paid - $2::numeric),
           status = 'cancelled',
           finance_status = 'refunded',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      [refund.membership_id, refundAmount],
    );
  }

  const updated = await client.query<Record<string, unknown>>(
    `UPDATE gym_refund_requests
     SET status = 'approved',
         approved_by = $2::varchar,
         approved_by_name = $3::varchar,
         approved_at = CURRENT_TIMESTAMP,
         ledger_entry_id = $4::varchar,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid
     RETURNING *`,
    [
      input.refundId,
      input.actor.id,
      approverName,
      ledgerInsert.rows[0]?.id ?? ledgerEventKey,
    ],
  );

  return updated.rows[0];
}

export { ensureGymSchema };
