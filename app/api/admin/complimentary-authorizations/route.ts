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
    const result = await query(`SELECT id, guest_name, scope, reservation_id, order_id, approved_amount, valid_from, valid_until, reason, ceo_reference, status, created_by, created_at, revoked_by, revoked_at FROM public.complimentary_authorizations ORDER BY created_at DESC LIMIT 100`);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch complimentary authorizations:", error);
    return NextResponse.json({ error: "Failed to fetch complimentary authorizations" }, { status: 500 });
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
