import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query, transaction } from "@/lib/db";
import { ensureGymSchema } from "@/lib/gym/schema";
import {
  createGymBookingTx,
  getAccraDateIso,
  transitionGymBookingStatusTx,
} from "@/lib/gym/service";
import { publishRealtime } from "@/lib/realtime";
import { getTaxConfiguration } from "@/lib/tax";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const dateFilter = String(request.nextUrl.searchParams.get("date") ?? "").trim();
    const statusFilter = String(request.nextUrl.searchParams.get("status") ?? "").trim();
    const todayIso = getAccraDateIso();

    const bookingsRes = await query(
      `SELECT
         b.id::text AS id,
         b.booking_number,
         b.member_id::text AS member_id,
         b.membership_id::text AS membership_id,
         b.plan_id::text AS plan_id,
         b.reservation_id::text AS reservation_id,
         b.trainer_name,
         b.session_date::text AS session_date,
         b.starts_at,
         b.ends_at,
         b.attendee_count,
         b.status,
         b.check_in_at,
         b.check_out_at,
         b.subtotal::numeric AS subtotal,
         b.discount_amount::numeric AS discount_amount,
         b.tax_amount::numeric AS tax_amount,
         b.total_invoiced::numeric AS total_invoiced,
         b.total_paid::numeric AS total_paid,
         b.balance_due::numeric AS balance_due,
         b.payment_status,
         b.finance_status,
         b.notes,
         b.cancellation_reason,
         b.created_at,
         m.member_number,
         m.first_name,
         m.last_name,
         m.phone,
         p.name AS plan_name,
         p.code AS plan_code,
         ms.membership_number
       FROM gym_bookings b
       JOIN gym_members m ON m.id = b.member_id
       LEFT JOIN gym_plans p ON p.id = b.plan_id
       LEFT JOIN gym_memberships ms ON ms.id = b.membership_id
       WHERE ($1::text = '' OR b.session_date = $1::date)
         AND ($2::text = '' OR b.status = $2::text)
       ORDER BY b.session_date DESC, b.starts_at DESC
       LIMIT 200`,
      [dateFilter, statusFilter],
    );

    const kpiRes = await query<{
      todays_sessions: string;
      checked_in_now: string;
      active_memberships: string;
      todays_revenue: string;
      pending_finance_count: string;
      pending_refunds_count: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM gym_bookings WHERE session_date = $1::date AND status <> 'cancelled') AS todays_sessions,
         (SELECT COUNT(*)::text FROM gym_bookings WHERE session_date = $1::date AND status = 'checked_in') AS checked_in_now,
         (SELECT COUNT(*)::text FROM gym_memberships WHERE status = 'active' AND end_date >= $1::date) AS active_memberships,
         (SELECT COALESCE(SUM(amount), 0)::text FROM gym_payments WHERE status = 'completed' AND (recorded_at AT TIME ZONE 'Africa/Accra')::date = $1::date) AS todays_revenue,
         (SELECT COUNT(*)::text FROM gym_payments WHERE verification_status IN ('pending_verification', 'pending_reconciliation')) AS pending_finance_count,
         (SELECT COUNT(*)::text FROM gym_refund_requests WHERE status = 'pending_finance_approval') AS pending_refunds_count`,
      [todayIso],
    );

    const kpi = kpiRes.rows[0];
    const taxConfig = await getTaxConfiguration();

    return NextResponse.json({
      bookings: bookingsRes.rows,
      summary: {
        todayDate: todayIso,
        todaysSessions: Number(kpi?.todays_sessions ?? 0),
        checkedInNow: Number(kpi?.checked_in_now ?? 0),
        activeMemberships: Number(kpi?.active_memberships ?? 0),
        todaysRevenue: Number(kpi?.todays_revenue ?? 0),
        pendingFinanceCount: Number(kpi?.pending_finance_count ?? 0),
        pendingRefundsCount: Number(kpi?.pending_refunds_count ?? 0),
      },
      taxConfiguration: taxConfig,
    });
  } catch (err) {
    console.error("[gym/bookings] GET failed:", err);
    return NextResponse.json({ error: "Failed to load gym bookings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const memberId = String(body.memberId ?? "").trim();
    if (!memberId) {
      return NextResponse.json({ error: "Gym member is required" }, { status: 400 });
    }

    const taxConfig = await getTaxConfiguration();
    const result = await transaction((client) =>
      createGymBookingTx(client, {
        memberId,
        planId: body.planId || null,
        membershipId: body.membershipId || null,
        reservationId: body.reservationId || null,
        trainerName: body.trainerName || null,
        sessionDate: body.sessionDate,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        attendeeCount: body.attendeeCount,
        discountAmount: body.discountAmount,
        notes: body.notes,
        taxConfig,
        actor: session,
      }),
    );

    await publishRealtime("gym.updated", String(result.booking.id));
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create gym booking";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const { session, error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const bookingId = String(body.bookingId ?? body.id ?? "").trim();
    const action = String(body.action ?? "").trim() as
      | "check_in"
      | "check_out"
      | "cancel"
      | "no_show";

    if (!bookingId || !["check_in", "check_out", "cancel", "no_show"].includes(action)) {
      return NextResponse.json(
        { error: "Valid bookingId and action (check_in, check_out, cancel, no_show) are required" },
        { status: 400 },
      );
    }

    const booking = await transaction((client) =>
      transitionGymBookingStatusTx(client, {
        bookingId,
        action,
        reason: body.reason,
        allowUnpaidCheckIn: Boolean(body.allowUnpaidCheckIn) && ["admin", "manager", "hotelManager", "operationsManager"].includes(session.role),
        actor: session,
      }),
    );

    await publishRealtime("gym.updated", bookingId);
    return NextResponse.json({ booking });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update gym booking status";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
