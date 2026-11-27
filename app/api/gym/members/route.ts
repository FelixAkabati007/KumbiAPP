import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query, transaction } from "@/lib/db";
import { ensureGymSchema } from "@/lib/gym/schema";
import { createGymMemberTx, getAccraDateIso } from "@/lib/gym/service";
import { publishRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const search = String(request.nextUrl.searchParams.get("q") ?? "").trim();
    const todayIso = getAccraDateIso();

    const membersRes = await query(
      `SELECT
         m.id::text AS id,
         m.member_number,
         m.guest_id::text AS guest_id,
         m.first_name,
         m.last_name,
         m.email,
         m.phone,
         m.emergency_contact_name,
         m.emergency_contact_phone,
         m.health_notes,
         m.status,
         m.created_at,
         active_sub.id::text AS active_membership_id,
         active_sub.membership_number AS active_membership_number,
         active_sub.plan_name AS active_plan_name,
         active_sub.end_date AS active_membership_end_date,
         active_sub.sessions_total AS active_sessions_total,
         active_sub.sessions_used AS active_sessions_used
       FROM gym_members m
       LEFT JOIN LATERAL (
         SELECT ms.id, ms.membership_number, ms.end_date, ms.sessions_total, ms.sessions_used, p.name AS plan_name
         FROM gym_memberships ms
         JOIN gym_plans p ON p.id = ms.plan_id
         WHERE ms.member_id = m.id
           AND ms.status = 'active'
           AND ms.end_date >= $2::date
           AND (ms.sessions_total IS NULL OR ms.sessions_used < ms.sessions_total)
         ORDER BY ms.end_date DESC
         LIMIT 1
       ) active_sub ON true
       WHERE (
         $1::text = ''
         OR m.member_number ILIKE '%' || $1::text || '%'
         OR (m.first_name || ' ' || m.last_name) ILIKE '%' || $1::text || '%'
         OR m.phone ILIKE '%' || $1::text || '%'
         OR COALESCE(m.email, '') ILIKE '%' || $1::text || '%'
       )
       ORDER BY m.created_at DESC
       LIMIT 200`,
      [search, todayIso],
    );

    const checkedInHotelGuests = await query(
      `SELECT r.id::text AS reservation_id,
              r.reservation_number,
              rm.room_number,
              g.id::text AS guest_id,
              g.first_name,
              g.last_name,
              g.phone,
              g.email
       FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       LEFT JOIN rooms rm ON rm.id = r.room_id
       WHERE r.status = 'checked_in'
       ORDER BY r.check_in_date DESC
       LIMIT 100`,
    ).catch(() => ({ rows: [] }));

    return NextResponse.json({
      members: membersRes.rows,
      checkedInHotelGuests: checkedInHotelGuests.rows,
    });
  } catch (err) {
    console.error("[gym/members] GET failed:", err);
    return NextResponse.json({ error: "Failed to load gym members" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requirePermission("gym");
  if (error) return error;

  try {
    await ensureGymSchema();
    const body = await request.json().catch(() => ({}));
    const member = await transaction((client) =>
      createGymMemberTx(client, {
        firstName: body.firstName ?? body.first_name,
        lastName: body.lastName ?? body.last_name,
        phone: body.phone,
        email: body.email,
        guestId: body.guestId ?? body.guest_id,
        emergencyContactName: body.emergencyContactName ?? body.emergency_contact_name,
        emergencyContactPhone: body.emergencyContactPhone ?? body.emergency_contact_phone,
        healthNotes: body.healthNotes ?? body.health_notes,
        actor: session,
      }),
    );

    await publishRealtime("gym.updated", String(member.id));
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to register gym member";
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
    if (!id) {
      return NextResponse.json({ error: "Member id is required" }, { status: 400 });
    }

    const updated = await query(
      `UPDATE gym_members
       SET first_name = COALESCE(NULLIF($2::varchar, ''), first_name),
           last_name = COALESCE(NULLIF($3::varchar, ''), last_name),
           phone = COALESCE(NULLIF($4::varchar, ''), phone),
           email = COALESCE($5::varchar, email),
           emergency_contact_name = COALESCE($6::varchar, emergency_contact_name),
           emergency_contact_phone = COALESCE($7::varchar, emergency_contact_phone),
           health_notes = COALESCE($8::text, health_notes),
           status = COALESCE($9::varchar, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING *`,
      [
        id,
        body.firstName !== undefined ? String(body.firstName).trim() : null,
        body.lastName !== undefined ? String(body.lastName).trim() : null,
        body.phone !== undefined ? String(body.phone).trim() : null,
        body.email !== undefined ? String(body.email).trim() || null : null,
        body.emergencyContactName !== undefined ? String(body.emergencyContactName).trim() || null : null,
        body.emergencyContactPhone !== undefined ? String(body.emergencyContactPhone).trim() || null : null,
        body.healthNotes !== undefined ? String(body.healthNotes).trim() || null : null,
        body.status && ["active", "inactive", "suspended"].includes(body.status) ? body.status : null,
      ],
    );

    if (!updated.rows[0]) {
      return NextResponse.json({ error: "Gym member not found" }, { status: 404 });
    }
    await publishRealtime("gym.updated", id);
    return NextResponse.json({ member: updated.rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update gym member";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
