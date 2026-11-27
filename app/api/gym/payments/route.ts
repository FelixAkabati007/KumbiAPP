import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess, requirePermission } from "@/lib/api-auth";
import { query, transaction } from "@/lib/db";
import { ensureGymSchema, notifyFinanceAndManagementForGym } from "@/lib/gym/schema";
import { processGymPaymentTx, reviewGymPaymentByFinanceTx } from "@/lib/gym/service";
import { publishRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const verificationStatus = String(
      request.nextUrl.searchParams.get("verificationStatus") ?? "",
    ).trim();

    const res = await query(
      `SELECT
         gp.id::text AS id,
         gp.payment_reference,
         gp.booking_id::text AS booking_id,
         gp.membership_id::text AS membership_id,
         gp.member_id::text AS member_id,
         gp.amount::numeric AS amount,
         gp.currency,
         gp.method,
         gp.provider_reference,
         gp.status,
         gp.verification_status,
         gp.recorded_by,
         gp.recorded_by_name,
         gp.recorded_at,
         gp.verified_by,
         gp.verified_by_name,
         gp.verified_at,
         gp.finance_note,
         gp.ledger_entry_id,
         m.first_name,
         m.last_name,
         m.member_number,
         b.booking_number,
         ms.membership_number
       FROM gym_payments gp
       JOIN gym_members m ON m.id = gp.member_id
       LEFT JOIN gym_bookings b ON b.id = gp.booking_id
       LEFT JOIN gym_memberships ms ON ms.id = gp.membership_id
       WHERE ($1::text = '' OR gp.verification_status = $1::text)
       ORDER BY gp.recorded_at DESC
       LIMIT 200`,
      [verificationStatus],
    );

    return NextResponse.json({ payments: res.rows });
  } catch (err) {
    console.error("[gym/payments] GET failed:", err);
    return NextResponse.json({ error: "Failed to load gym payments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const headerIdem = request.headers.get("Idempotency-Key");

    const result = await transaction((client) =>
      processGymPaymentTx(client, {
        bookingId: body.bookingId || null,
        membershipId: body.membershipId || null,
        amount: body.amount,
        method: body.method,
        providerReference: body.providerReference || null,
        reservationId: body.reservationId || null,
        idempotencyKey: headerIdem || body.idempotencyKey || null,
        requireFinanceVerification: Boolean(body.requireFinanceVerification),
        notes: body.notes || null,
        actor: session,
      }),
    );

    const payRow = result.payment as Record<string, unknown>;
    const payRef = String(payRow.payment_reference ?? "");
    const amountFmt = Number(payRow.amount ?? 0).toFixed(2);

    if (!result.replayed) {
      if (result.requiresFinanceApproval) {
        await notifyFinanceAndManagementForGym({
          title: "Gym Payment Awaiting Finance Verification",
          message: `${payRef} (GHS ${amountFmt} via ${String(payRow.method ?? "").replace("_", " ")}) for ${result.receiptNumber ?? "Gym"} requires Finance verification before posting.`,
          type: "gym_finance_verification",
          url: "/finance",
          dedupeKey: `gym-fin-verify:${payRef}`,
          metadata: { paymentReference: payRef, amount: Number(payRow.amount ?? 0) },
        });
      } else {
        await notifyFinanceAndManagementForGym({
          title: "Gym Revenue Recorded",
          message: `${payRef} (GHS ${amountFmt}) settled for ${result.receiptNumber ?? "Gym"} and queued for Finance reconciliation.`,
          type: "gym_payment_posted",
          url: "/finance",
          dedupeKey: `gym-fin-posted:${payRef}`,
          metadata: { paymentReference: payRef, amount: Number(payRow.amount ?? 0) },
        });
      }
    }

    await publishRealtime("gym.updated", payRef);
    await publishRealtime("finance.updated", payRef);
    await publishRealtime("payments.updated", payRef);

    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process gym payment";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireFinanceAccess();
  if (access.error) return access.error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const paymentId = String(body.paymentId ?? body.id ?? "").trim();
    const action = String(body.action ?? "").trim() as
      | "approve_and_post"
      | "reconcile"
      | "reject";

    if (!paymentId || !["approve_and_post", "reconcile", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Valid paymentId and Finance action (approve_and_post, reconcile, reject) are required" },
        { status: 400 },
      );
    }

    const updated = await transaction((client) =>
      reviewGymPaymentByFinanceTx(client, {
        paymentId,
        action,
        financeNote: body.financeNote ?? body.note ?? null,
        actor: access.session,
      }),
    );

    const ref = String(updated.payment_reference ?? paymentId);
    await publishRealtime("gym.updated", ref);
    await publishRealtime("finance.updated", ref);
    await publishRealtime("payments.updated", ref);

    return NextResponse.json({ payment: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to complete Finance payment review";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
