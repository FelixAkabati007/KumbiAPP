import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";

const allowedStatuses = new Set(["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "superseded"]);

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

export async function GET(request: Request) {
  const { error } = await requirePermission("eventPricing");
  if (error) return error;
  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  const result = await query(
    `SELECT q.id, q.event_id, q.status, q.currency, q.discount_amount, q.tax_amount, q.deposit_percent, q.subtotal, q.total, q.created_at,
      COALESCE(json_agg(json_build_object('id', i.id, 'label', i.label, 'description', i.description, 'pricing_unit', i.pricing_unit, 'quantity', i.quantity, 'unit_price', i.unit_price, 'amount', i.amount) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM event_quotes q LEFT JOIN event_quote_items i ON i.quote_id = q.id
     WHERE q.event_id = $1 GROUP BY q.id ORDER BY q.created_at DESC`,
    [eventId]
  );
  return NextResponse.json({ quotes: result.rows });
}

export async function POST(request: Request) {
  const { session, error } = await requirePermission("eventPricing");
  if (error) return error;
  const body = await request.json();
  const eventId = String(body.eventId ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  const discountAmount = money(body.discountAmount ?? 0);
  const taxAmount = money(body.taxAmount ?? 0);
  const depositPercent = Number(body.depositPercent ?? 50);
  if (!eventId || !items.length || discountAmount === null || taxAmount === null || !Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    return NextResponse.json({ error: "Event, at least one line item, valid amounts, and a deposit percentage are required" }, { status: 400 });
  }

  const normalized: Array<{ label: string; description: string; pricingUnit: string; quantity: number; unitPrice: number; amount: number } | null> = items.map((item: Record<string, unknown>) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = money(item.unitPrice ?? 0);
    const label = String(item.label ?? "").trim();
    const pricingUnit = String(item.pricingUnit ?? "fixed");
    if (!label || unitPrice === null || !Number.isFinite(quantity) || quantity <= 0 || !["fixed", "per_guest", "per_hour", "per_staff"].includes(pricingUnit)) return null;
    return { label, description: String(item.description ?? "").trim(), pricingUnit, quantity, unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100 };
  });
  if (normalized.some((item) => item === null)) return NextResponse.json({ error: "Each quote item must have a label, valid quantity, unit price, and pricing unit" }, { status: 400 });
  const validItems = normalized as Array<{ label: string; description: string; pricingUnit: string; quantity: number; unitPrice: number; amount: number }>;
  const subtotal = validItems.reduce((sum, item) => sum + item.amount, 0);
  const total = Math.max(0, Math.round((subtotal - discountAmount + taxAmount) * 100) / 100);

  const quoteResult = await query(
    `INSERT INTO event_quotes (event_id, status, discount_amount, tax_amount, deposit_percent, subtotal, total, created_by)
     VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7) RETURNING id, event_id, status, currency, discount_amount, tax_amount, deposit_percent, subtotal, total, created_at`,
    [eventId, discountAmount, taxAmount, depositPercent, subtotal, total, session.id]
  );
  const quote = quoteResult.rows[0];
  for (const item of validItems) {
    await query(`INSERT INTO event_quote_items (quote_id, label, description, pricing_unit, quantity, unit_price, amount) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [quote.id, item.label, item.description, item.pricingUnit, item.quantity, item.unitPrice, item.amount]);
  }
  return NextResponse.json({ quote: { ...quote, items: validItems } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { session, error } = await requirePermission("eventPricing");
  if (error) return error;
  const body = await request.json();
  const quoteId = String(body.quoteId ?? "").trim();
  const status = String(body.status ?? "");
  if (!quoteId || !allowedStatuses.has(status)) return NextResponse.json({ error: "A valid quote and status are required" }, { status: 400 });
  const result = await query(`UPDATE event_quotes SET status = $1, approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END, updated_at = now() WHERE id = $3 RETURNING id, status, approved_by, updated_at`, [status, session.id, quoteId]);
  if (!result.rows[0]) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.json({ quote: result.rows[0] });
}
