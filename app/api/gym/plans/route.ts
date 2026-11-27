import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { ensureGymSchema } from "@/lib/gym/schema";
import { publishRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
    const res = await query(
      `SELECT id::text AS id, code, name, description, plan_type, duration_days,
              max_sessions, base_price::numeric AS base_price, currency,
              includes_trainer, max_capacity_per_slot, is_active, created_at, updated_at
       FROM gym_plans
       WHERE ($1::boolean = true OR is_active = true)
       ORDER BY
         CASE plan_type
           WHEN 'walk_in_session' THEN 1
           WHEN 'day_pass' THEN 2
           WHEN 'personal_training' THEN 3
           WHEN 'membership' THEN 4
           ELSE 5
         END,
         base_price ASC`,
      [includeInactive],
    );
    return NextResponse.json({ plans: res.rows });
  } catch (err) {
    console.error("[gym/plans] GET failed:", err);
    return NextResponse.json({ error: "Failed to load gym plans" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requirePermission("gymPricing");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const rawCode = String(body.code ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, "-");
    const code = rawCode || `GYM-PLAN-${Date.now().toString(36).toUpperCase()}`;
    const planType = String(body.planType ?? body.plan_type ?? "membership").trim();
    const durationDays = Math.max(1, Math.trunc(Number(body.durationDays ?? body.duration_days ?? 30) || 30));
    const maxSessions =
      body.maxSessions === null || body.maxSessions === "" || body.maxSessions === undefined
        ? null
        : Math.max(1, Math.trunc(Number(body.maxSessions)));
    const basePrice = Math.max(0, Number(body.basePrice ?? body.base_price ?? 0) || 0);
    const includesTrainer = Boolean(body.includesTrainer ?? body.includes_trainer ?? false);
    const maxCapacity = Math.max(
      1,
      Math.trunc(Number(body.maxCapacityPerSlot ?? body.max_capacity_per_slot ?? 30) || 30),
    );

    if (!name) {
      return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
    }
    if (!["walk_in_session", "day_pass", "membership", "personal_training", "corporate"].includes(planType)) {
      return NextResponse.json({ error: "Invalid gym plan type" }, { status: 400 });
    }

    const inserted = await query(
      `INSERT INTO gym_plans (
         code, name, description, plan_type, duration_days, max_sessions,
         base_price, currency, includes_trainer, max_capacity_per_slot, is_active, created_by
       )
       VALUES (
         $1::varchar, $2::varchar, $3::text, $4::varchar, $5::int, $6::int,
         $7::numeric, 'GHS', $8::boolean, $9::int, true, $10::varchar
       )
       RETURNING *`,
      [
        code,
        name,
        String(body.description ?? "").trim() || null,
        planType,
        durationDays,
        maxSessions,
        basePrice,
        includesTrainer,
        maxCapacity,
        session.id,
      ],
    );

    await publishRealtime("gym.updated", String(inserted.rows[0]?.id ?? code));
    return NextResponse.json({ plan: inserted.rows[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create gym plan";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission("gymPricing");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Plan id is required" }, { status: 400 });
    }

    const updated = await query(
      `UPDATE gym_plans
       SET name = COALESCE(NULLIF($2::varchar, ''), name),
           description = COALESCE($3::text, description),
           duration_days = COALESCE($4::int, duration_days),
           max_sessions = CASE WHEN $5::boolean THEN $6::int ELSE max_sessions END,
           base_price = COALESCE($7::numeric, base_price),
           includes_trainer = COALESCE($8::boolean, includes_trainer),
           max_capacity_per_slot = COALESCE($9::int, max_capacity_per_slot),
           is_active = COALESCE($10::boolean, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [
        id,
        body.name !== undefined ? String(body.name).trim() : null,
        body.description !== undefined ? String(body.description).trim() : null,
        body.durationDays !== undefined ? Math.max(1, Number(body.durationDays) || 1) : null,
        body.maxSessions !== undefined,
        body.maxSessions === null || body.maxSessions === "" ? null : Number(body.maxSessions) || null,
        body.basePrice !== undefined ? Math.max(0, Number(body.basePrice) || 0) : null,
        body.includesTrainer !== undefined ? Boolean(body.includesTrainer) : null,
        body.maxCapacityPerSlot !== undefined
          ? Math.max(1, Number(body.maxCapacityPerSlot) || 30)
          : null,
        body.isActive !== undefined ? Boolean(body.isActive) : null,
      ],
    );

    if (!updated.rows[0]) {
      return NextResponse.json({ error: "Gym plan not found" }, { status: 404 });
    }

    await publishRealtime("gym.updated", id);
    return NextResponse.json({ plan: updated.rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update gym plan";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
