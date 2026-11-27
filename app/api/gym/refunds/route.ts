import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess, requirePermission } from "@/lib/api-auth";
import { query, transaction } from "@/lib/db";
import { ensureGymSchema, notifyFinanceAndManagementForGym } from "@/lib/gym/schema";
import { createGymRefundRequestTx, reviewGymRefundByFinanceTx } from "@/lib/gym/service";
import { publishRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const statusFilter = String(request.nextUrl.searchParams.get("status") ?? "").trim();

    const res = await query(
      `SELECT
         r.id::text AS id,
         r.refund_number,
         r.booking_id::text AS booking_id,
         r.membership_id::text AS membership_id,
         r.payment_id::text AS payment_id,
         r.member_id::text AS member_id,
         r.amount::numeric AS amount,
         r.currency,
         r.reason,
         r.status,
         r.requested_by,
         r.requested_by_name,
         r.approved_by,
         r.approved_by_name,
         r.approved_at,
         r.rejection_reason,
         r.ledger_entry_id,
         r.created_at,
         gp.payment_reference,
         gp.method AS payment_method,
         m.first_name,
         m.last_name,
         b.booking_number,
         ms.membership_number
       FROM gym_refund_requests r
       JOIN gym_payments gp ON gp.id = r.payment_id
       JOIN gym_members m ON m.id = r.member_id
       LEFT JOIN gym_bookings b ON b.id = r.booking_id
       LEFT JOIN gym_memberships ms ON ms.id = r.membership_id
       WHERE ($1::text = '' OR r.status = $1::text)
       ORDER BY r.created_at DESC
       LIMIT 200`,
      [statusFilter],
    );

    return NextResponse.json({ refunds: res.rows });
  } catch (err) {
    console.error("[gym/refunds] GET failed:", err);
    return NextResponse.json({ error: "Failed to load gym refund requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const paymentId = String(body.paymentId ?? "").trim();
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    const refund = await transaction((client) =>
      createGymRefundRequestTx(client, {
        paymentId,
        amount: body.amount,
        reason: String(body.reason ?? ""),
        actor: session,
      }),
    );

    const refNum = String(refund.refund_number ?? "");
    await notifyFinanceAndManagementForGym({
      title: "Gym Refund Approval Requested",
      message: `${refNum} (GHS ${Number(refund.amount ?? 0).toFixed(2)}) awaits Finance Department approval.`,
      type: "gym_refund_requested",
      url: "/finance",
      dedupeKey: `gym-refund-req:${refNum}`,
      metadata: { refundNumber: refNum, amount: Number(refund.amount ?? 0) },
    });

    await publishRealtime("gym.updated", refNum);
    await publishRealtime("finance.updated", refNum);

    return NextResponse.json({ refund }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to submit gym refund request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireFinanceAccess();
  if (access.error) return access.error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const refundId = String(body.refundId ?? body.id ?? "").trim();
    const action = String(body.action ?? "").trim() as "approve" | "reject";

    if (!refundId || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Valid refundId and Finance action (approve, reject) are required" },
        { status: 400 },
      );
    }

    const refund = await transaction((client) =>
      reviewGymRefundByFinanceTx(client, {
        refundId,
        action,
        rejectionReason: body.rejectionReason ?? body.reason ?? null,
        actor: access.session,
      }),
    );

    const refNum = String(refund.refund_number ?? refundId);
    await publishRealtime("gym.updated", refNum);
    await publishRealtime("finance.updated", refNum);
    await publishRealtime("payments.updated", refNum);

    return NextResponse.json({ refund });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to review gym refund request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
