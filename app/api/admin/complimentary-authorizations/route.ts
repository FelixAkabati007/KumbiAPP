import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAuthorizationAccess() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "admin" && session.role !== "frontDesk") return { error: NextResponse.json({ error: "Only Admin and Reception can manage VIP authorizations" }, { status: 403 }) };
  return { session };
}

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "admin") return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  try {
    const auth = await requireAuthorizationAccess();
    if (auth.error) return auth.error;
    const result = await query(`SELECT a.id, a.guest_name, a.scope, a.reservation_id, a.order_id, a.room_id, a.stay_nights, a.room_waived, a.folio_waived, a.approved_amount, a.valid_from, a.valid_until, a.reason, a.ceo_reference, a.status, a.created_by, a.created_at, a.revoked_by, a.revoked_at, COALESCE(SUM(u.amount_used), 0) AS used_amount, (a.approved_amount - COALESCE(SUM(u.amount_used), 0)) AS remaining_amount FROM public.complimentary_authorizations a LEFT JOIN public.complimentary_authorization_usage u ON u.authorization_id = a.id GROUP BY a.id ORDER BY a.created_at DESC LIMIT 100`);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch complimentary authorizations:", error);
    return NextResponse.json({ error: "Failed to fetch complimentary authorizations" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Authorization id is required" }, { status: 400 });
    const result = await transaction(async (client) => {
      const revoked = await client.query(`UPDATE public.complimentary_authorizations SET status = 'revoked', revoked_by = $2, revoked_at = now(), revoked_reason = $3 WHERE id = $1 AND status = 'active' RETURNING id, status, revoked_at`, [body.id, auth.session.id, String(body.reason || "Revoked by Admin")]);
      if (!revoked.rowCount) return null;
      await client.query(`INSERT INTO public.complimentary_authorization_audit (authorization_id, actor_id, action, details) VALUES ($1,$2,'revoked',$3)`, [body.id, auth.session.id, JSON.stringify({ reason: body.reason || "Revoked by Admin" })]);
      return revoked.rows[0];
    });
    if (!result) return NextResponse.json({ error: "Authorization is already inactive or does not exist" }, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to revoke complimentary authorization:", error);
    return NextResponse.json({ error: "Failed to revoke complimentary authorization" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthorizationAccess();
    if (auth.error) return auth.error;
    const body = await request.json();
    const { guestName, scope, reservationId, orderId, approvedAmount, validUntil, reason, ceoReference, roomId, stayNights, activateStay } = body;
    const parsedAmount = Number(approvedAmount);
    const parsedValidUntil = new Date(validUntil);
    const nights = Number(stayNights || 0);
    if (!guestName?.trim() || !["hotel", "restaurant", "event", "both"].includes(scope) || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !validUntil || Number.isNaN(parsedValidUntil.getTime()) || parsedValidUntil <= new Date() || !reason?.trim()) {
      return NextResponse.json({ error: "Guest, scope, a positive amount, a future expiry, and a reason are required" }, { status: 400 });
    }
    if (roomId && (!Number.isInteger(nights) || nights < 1 || nights > 90)) {
      return NextResponse.json({ error: "Stay nights must be between 1 and 90" }, { status: 400 });
    }

    const result = await transaction(async (client) => {
      let linkedReservationId = reservationId || null;
      if (roomId && !linkedReservationId) {
        const room = await client.query(`SELECT r.id, r.room_type_id, r.status, COALESCE(r.price, rt.base_price) AS nightly_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = $1 AND r.is_active = true FOR UPDATE`, [roomId]);
        if (!room.rows[0] || !["available", "dirty", "cleaning"].includes(room.rows[0].status)) throw new Error("Selected room is not available");
        const guestParts = guestName.trim().split(/\s+/);
        const guest = await client.query(`INSERT INTO guests (first_name, last_name, is_vip) VALUES ($1, $2, true) RETURNING id`, [guestParts[0], guestParts.slice(1).join(" ") || null]);
        const checkIn = new Date();
        const checkOut = new Date(checkIn.getTime() + nights * 86400000);
        const reservation = await client.query(`INSERT INTO reservations (reservation_number, guest_id, room_type_id, room_id, check_in_date, check_out_date, number_of_guests, total_price, special_requests, source, created_by, status) VALUES ('VIP-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD((SELECT (COUNT(*) + 1)::text FROM reservations WHERE created_at::date = CURRENT_DATE), 4, '0'), $1, $2, $3, $4::date, $5::date, 1, $6, $7, 'vip_complimentary', $8, 'confirmed') RETURNING id`, [guest.rows[0].id, room.rows[0].room_type_id, roomId, checkIn.toISOString(), checkOut.toISOString(), Number(room.rows[0].nightly_rate) * nights, reason, auth.session.id]);
        linkedReservationId = reservation.rows[0].id;
        if (activateStay) {
          await client.query(`UPDATE reservations SET status = 'checked_in', updated_at = now() WHERE id = $1`, [linkedReservationId]);
          await client.query(`UPDATE rooms SET status = 'occupied', current_guest_id = $1, updated_at = now() WHERE id = $2`, [guest.rows[0].id, roomId]);
        }
      }
      const inserted = await client.query(`INSERT INTO public.complimentary_authorizations (guest_name, scope, reservation_id, order_id, room_id, stay_nights, room_waived, folio_waived, approved_amount, valid_until, reason, ceo_reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, guest_name, scope, reservation_id, room_id, stay_nights, room_waived, folio_waived, approved_amount, valid_until, reason, ceo_reference, status, created_at`, [guestName, scope, linkedReservationId, orderId || null, roomId || null, roomId ? nights : null, Boolean(roomId), scope === "restaurant" || scope === "both", approvedAmount, validUntil, reason, ceoReference || null, auth.session.id]);
      await client.query(`INSERT INTO public.complimentary_authorization_audit (authorization_id, actor_id, action, details) VALUES ($1,$2,$3,$4)`, [inserted.rows[0].id, auth.session.id, activateStay ? "authorized_and_checked_in" : linkedReservationId ? "authorized_and_booked" : "authorized", JSON.stringify({ roomId: roomId || null, stayNights: roomId ? nights : null, scope, activateStay: Boolean(activateStay) })]);
      return inserted.rows[0];
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create complimentary authorization:", error);
    const detail = error instanceof Error ? error.message : "Failed to create complimentary authorization";
    return NextResponse.json({ error: detail.includes("complimentary_authorizations") ? "The authorization could not be saved. Check the expiry and amount, then try again." : detail }, { status: 500 });
  }
}
