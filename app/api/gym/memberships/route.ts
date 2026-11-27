import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query, transaction } from "@/lib/db";
import { ensureGymSchema } from "@/lib/gym/schema";
import { createGymMembershipTx, getAccraDateIso } from "@/lib/gym/service";
import { publishRealtime } from "@/lib/realtime";
import { getTaxConfiguration } from "@/lib/tax";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const todayIso = getAccraDateIso();

    // Auto-expire past-due active memberships accurately in Accra property timezone
    await query(
      `UPDATE gym_memberships
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active' AND end_date < $1::date`,
      [todayIso],
    ).catch(() => undefined);

    const statusFilter = String(request.nextUrl.searchParams.get("status") ?? "").trim();
    const memberId = String(request.nextUrl.searchParams.get("memberId") ?? "").trim();

    const res = await query(
      `SELECT
         ms.id::text AS id,
         ms.membership_number,
         ms.member_id::text AS member_id,
         ms.plan_id::text AS plan_id,
         ms.start_date::text AS start_date,
         ms.end_date::text AS end_date,
         ms.sessions_total,
         ms.sessions_used,
         ms.subtotal::numeric AS subtotal,
         ms.discount_amount::numeric AS discount_amount,
         ms.tax_amount::numeric AS tax_amount,
         ms.total_invoiced::numeric AS total_invoiced,
         ms.total_paid::numeric AS total_paid,
         ms.balance_due::numeric AS balance_due,
         ms.status,
         ms.finance_status,
         ms.notes,
         ms.created_at,
         m.member_number,
         m.first_name,
         m.last_name,
         m.phone,
         p.name AS plan_name,
         p.code AS plan_code,
         p.duration_days
       FROM gym_memberships ms
       JOIN gym_members m ON m.id = ms.member_id
       JOIN gym_plans p ON p.id = ms.plan_id
       WHERE ($1::text = '' OR ms.status = $1::text)
         AND ($2::text = '' OR ms.member_id::text = $2::text)
       ORDER BY ms.created_at DESC
       LIMIT 200`,
      [statusFilter, memberId],
    );

    return NextResponse.json({ memberships: res.rows });
  } catch (err) {
    console.error("[gym/memberships] GET failed:", err);
    return NextResponse.json({ error: "Failed to load gym memberships" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const memberId = String(body.memberId ?? "").trim();
    const planId = String(body.planId ?? "").trim();
    if (!memberId || !planId) {
      return NextResponse.json({ error: "Member and Gym Plan are required" }, { status: 400 });
    }

    const taxConfig = await getTaxConfiguration();
    const created = await transaction((client) =>
      createGymMembershipTx(client, {
        memberId,
        planId,
        startDate: body.startDate,
        discountAmount: body.discountAmount,
        notes: body.notes,
        taxConfig,
        actor: session,
      }),
    );

    await publishRealtime("gym.updated", String(created.membership.id));
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create gym membership";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    const status = String(body.status ?? "").trim();
    if (!id || !["active", "paused", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "Valid membership id and target status (active, paused, cancelled) are required" },
        { status: 400 },
      );
    }

    const updated = await query(
      `UPDATE gym_memberships
       SET status = $2::varchar,
           notes = COALESCE($3::text, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [id, status, body.notes !== undefined ? String(body.notes).trim() : null],
    );

    if (!updated.rows[0]) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    await publishRealtime("gym.updated", id);
    return NextResponse.json({ membership: updated.rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update membership";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
