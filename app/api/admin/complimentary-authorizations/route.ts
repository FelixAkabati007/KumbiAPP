import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const result = await query(`SELECT a.id, a.guest_name, a.scope, a.reservation_id, a.order_id, a.approved_amount, a.valid_from, a.valid_until, a.reason, a.ceo_reference, a.status, a.created_by, a.created_at, a.revoked_by, a.revoked_at, COALESCE(SUM(u.amount_used), 0) AS used_amount, (a.approved_amount - COALESCE(SUM(u.amount_used), 0)) AS remaining_amount FROM public.complimentary_authorizations a LEFT JOIN public.complimentary_authorization_usage u ON u.authorization_id = a.id GROUP BY a.id ORDER BY a.created_at DESC LIMIT 100`);
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
    const result = await query(`UPDATE public.complimentary_authorizations SET status = 'revoked', revoked_by = $2, revoked_at = now() WHERE id = $1 AND status = 'active' RETURNING id, status, revoked_at`, [body.id, auth.session.id]);
    if (!result.rowCount) return NextResponse.json({ error: "Authorization is already inactive or does not exist" }, { status: 409 });
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to revoke complimentary authorization:", error);
    return NextResponse.json({ error: "Failed to revoke complimentary authorization" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const body = await request.json();
    const { guestName, scope, reservationId, orderId, approvedAmount, validUntil, reason, ceoReference } = body;
    if (!guestName || !scope || !approvedAmount || !validUntil || !reason) return NextResponse.json({ error: "Guest, scope, amount, expiry, and reason are required" }, { status: 400 });
    const result = await query(`INSERT INTO public.complimentary_authorizations (guest_name, scope, reservation_id, order_id, approved_amount, valid_until, reason, ceo_reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, guest_name, scope, approved_amount, valid_until, reason, ceo_reference, status, created_at`, [guestName, scope, reservationId || null, orderId || null, approvedAmount, validUntil, reason, ceoReference || null, auth.session.id]);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create complimentary authorization:", error);
    return NextResponse.json({ error: "Failed to create complimentary authorization" }, { status: 500 });
  }
}
