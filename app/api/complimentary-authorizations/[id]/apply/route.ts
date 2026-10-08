import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { complimentaryLedgerMetadata } from "@/lib/finance-classification";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "frontDesk", "manager"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json();
    const amount = Number(body.amount);
    const transactionType = String(body.transactionType || "restaurant");
    const transactionId = String(body.transactionId || "");
    if (!Number.isFinite(amount) || amount <= 0 || !transactionId || !["restaurant", "hotel", "event", "folio"].includes(transactionType)) {
      return NextResponse.json({ error: "A positive amount, transaction type, and transaction ID are required" }, { status: 400 });
    }
    const result = await query(`WITH authorization AS (SELECT a.id, a.approved_by, a.approved_amount, COALESCE((SELECT SUM(u.amount_used) FROM public.complimentary_authorization_usage u WHERE u.authorization_id = a.id), 0) AS used FROM public.complimentary_authorizations a WHERE a.id = $1 AND a.status = 'active' AND a.valid_from <= now() AND a.valid_until > now() FOR UPDATE), inserted AS (INSERT INTO public.complimentary_authorization_usage (authorization_id, amount_used, transaction_type, transaction_id, applied_by) SELECT id, $2, $3, $4, $5 FROM authorization WHERE $2 <= (approved_amount - used) RETURNING *) SELECT i.id, i.authorization_id, i.amount_used, a.approved_by, (a.approved_amount - a.used - i.amount_used) AS remaining FROM inserted i JOIN authorization a ON a.id = i.authorization_id`, [id, amount, transactionType, transactionId, session.id]);
    if (!result.rowCount) return NextResponse.json({ error: "Authorization is expired, revoked, unavailable, or over its remaining limit" }, { status: 409 });
    const usage = result.rows[0];
    const appliedBy = { id: session.id, name: session.email, email: session.email };
    await query(`INSERT INTO canonical_financial_ledger (event_key, amount, currency, direction, status, source, payment_method, entity_type, entity_id, journal_type, metadata, occurred_at)
      VALUES ($1, $2, 'GHS', 'debit', 'posted', $3, 'complimentary-waived', 'complimentary_authorization_usage', $4, 'complimentary_waiver', $5::jsonb, NOW()) ON CONFLICT (event_key) DO NOTHING`,
      [`VIP-AUTHORIZATION-${usage.id}`, usage.amount_used, `vip-authorization-${usage.authorization_id}`, usage.id, JSON.stringify(complimentaryLedgerMetadata(String(usage.authorization_id), String(usage.id), Number(usage.amount_used), appliedBy, usage.approved_by ? { id: String(usage.approved_by) } : undefined))]);
    return NextResponse.json({ success: true, usage }, { status: 201 });
  } catch (error) {
    console.error("Failed to apply complimentary authorization:", error);
    return NextResponse.json({ error: "Failed to apply complimentary authorization" }, { status: 500 });
  }
}
