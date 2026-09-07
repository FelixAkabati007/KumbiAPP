import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "home";

async function requireAuthorizationAccess() {
  const session = await getSession();
  if (!session) return null;
  return session.role === "admin" || session.role === "frontDesk" ? session : false;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAuthorizationAccess();
    if (!admin) return NextResponse.json({ error: admin === null ? "Unauthorized" : "Forbidden" }, { status: admin === null ? 401 : 403 });
    const { id } = await params;
    const result = await query(
      `SELECT a.id, a.guest_name, a.scope, a.reservation_id, a.order_id, a.room_id, a.stay_nights, a.room_waived, a.folio_waived, a.approved_amount, a.valid_from, a.valid_until, a.reason, a.ceo_reference, a.status, a.created_by, a.created_at, a.revoked_by, a.revoked_at,
        COALESCE(SUM(u.amount_used), 0) AS used_amount,
        a.approved_amount - COALESCE(SUM(u.amount_used), 0) AS remaining_amount,
        COALESCE(json_agg(json_build_object('id', u.id, 'amount_used', u.amount_used, 'transaction_type', u.transaction_type, 'transaction_id', u.transaction_id, 'applied_by', u.applied_by) ORDER BY u.id DESC) FILTER (WHERE u.id IS NOT NULL), '[]') AS usage,
        (SELECT COALESCE(json_agg(json_build_object('id', al.id, 'action', al.action, 'actor_id', al.actor_id, 'details', al.details, 'created_at', al.created_at) ORDER BY al.created_at DESC), '[]') FROM public.complimentary_authorization_audit al WHERE al.authorization_id = a.id) AS audit_log,
        (SELECT COALESCE(json_agg(json_build_object('id', fi.id, 'category', fi.category, 'description', fi.description, 'quantity', fi.quantity, 'unit_amount', fi.unit_amount, 'total_amount', fi.total_amount, 'created_at', fi.created_at) ORDER BY fi.created_at ASC), '[]') FROM public.guest_folio_items fi WHERE fi.reservation_id = a.reservation_id) AS folio_items,
        (SELECT json_build_object('gross_amount', COALESCE((SELECT SUM(fi.total_amount) FROM public.guest_folio_items fi WHERE fi.reservation_id = a.reservation_id), 0), 'complimentary_amount', COALESCE((SELECT SUM(u.amount_used) FROM public.complimentary_authorization_usage u WHERE u.authorization_id = a.id), 0), 'net_amount', GREATEST(0, COALESCE((SELECT SUM(fi.total_amount) FROM public.guest_folio_items fi WHERE fi.reservation_id = a.reservation_id), 0) - COALESCE((SELECT SUM(u.amount_used) FROM public.complimentary_authorization_usage u WHERE u.authorization_id = a.id), 0)))) AS folio_summary
       FROM public.complimentary_authorizations a
       LEFT JOIN public.complimentary_authorization_usage u ON u.authorization_id = a.id
       WHERE a.id = $1
       GROUP BY a.id`,
      [id]
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Authorization not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to fetch complimentary authorization detail:", error);
    return NextResponse.json({ error: "Failed to fetch authorization detail" }, { status: 500 });
  }
}
