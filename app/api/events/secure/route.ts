import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query, transaction } from "@/lib/db";

export async function POST(request: Request) {
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const eventId = String(body.eventId ?? "").trim();
  const quoteId = String(body.quoteId ?? "").trim();
  if (!eventId || !quoteId) return NextResponse.json({ error: "Event and accepted quote are required" }, { status: 400 });

  try {
    const result = await transaction(async (client) => {
      const eventResult = await client.query(`SELECT id, name, client_name, venue, starts_at, ends_at, guest_count, status FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
      const quoteResult = await client.query(`SELECT q.id, q.status, q.total, q.currency, COALESCE(json_agg(json_build_object('description', i.label, 'quantity', i.quantity, 'total_amount', i.amount) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items FROM event_quotes q LEFT JOIN event_quote_items i ON i.quote_id = q.id WHERE q.id = $1 AND q.event_id = $2 GROUP BY q.id`, [quoteId, eventId]);
      const event = eventResult.rows[0];
      const quote = quoteResult.rows[0];
      if (!event || !quote) throw new Error("EVENT_OR_QUOTE_NOT_FOUND");
      if (!['approved', 'accepted'].includes(quote.status)) throw new Error("QUOTE_NOT_ACCEPTED");
      if (event.secured_at) throw new Error("EVENT_ALREADY_SECURED");
      const receipt = await client.query(`INSERT INTO hotel_receipts (order_id, order_number, receipt_type, snapshot, created_by) VALUES ($1, $2, 'event_booking', $3::jsonb, $4) RETURNING id`, [event.id, `EVENT-${event.id.slice(0, 8).toUpperCase()}`, JSON.stringify({ event, quote, securedBy: { id: session.id, name: session.name, email: session.email, role: session.role }, securedAt: new Date().toISOString() }), session.id]);
      await client.query(`UPDATE events SET status = 'confirmed', secured_at = now(), secured_by = $1, receipt_id = $2, updated_at = now() WHERE id = $3`, [session.id, receipt.rows[0].id, eventId]);
      await client.query(`UPDATE event_quotes SET status = 'accepted', updated_at = now() WHERE id = $1`, [quoteId]);
      return { event, quote, receiptId: receipt.rows[0].id };
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to secure event";
    const status = ["EVENT_OR_QUOTE_NOT_FOUND", "QUOTE_NOT_ACCEPTED", "EVENT_ALREADY_SECURED"].includes(message) ? 409 : 500;
    return NextResponse.json({ error: message === "QUOTE_NOT_ACCEPTED" ? "Only an approved or accepted quote can secure the event" : message }, { status });
  }
}
