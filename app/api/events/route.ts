import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";

export async function GET() {
  const { error } = await requirePermission("events");
  if (error) return error;

  const result = await query(`
    SELECT e.id, e.name, e.client_name, e.venue, e.starts_at, e.ends_at, e.guest_count, e.status, e.notes,
      e.receipt_id,
      EXISTS (SELECT 1 FROM event_quotes q WHERE q.event_id = e.id AND q.status IN ('approved', 'accepted')) AS quote_approved,
      EXISTS (SELECT 1 FROM canonical_financial_ledger l WHERE l.entity_type = 'event' AND l.entity_id = e.id::text AND l.status = 'posted') AS finance_posted
    FROM events e
    ORDER BY starts_at ASC
  `);

  return NextResponse.json({ events: result.rows });
}

export async function POST(request: Request) {
  const { session, error } = await requirePermission("events");
  if (error) return error;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const clientName = String(body.clientName ?? "").trim();
  const venue = String(body.venue ?? "").trim();
  const startsAt = String(body.startsAt ?? "").trim();
  const guestCount = Number(body.guestCount ?? 0);

  if (!name || !clientName || !venue || !startsAt || !Number.isInteger(guestCount) || guestCount < 0) {
    return NextResponse.json({ error: "Event name, client, venue, start time, and a valid guest count are required" }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO events (name, client_name, venue, starts_at, guest_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, client_name, venue, starts_at, ends_at, guest_count, status, notes`,
    [name, clientName, venue, startsAt, guestCount, session.id]
  );

  return NextResponse.json({ event: result.rows[0] }, { status: 201 });
}

const allowedTransitions: Record<string, string[]> = {
  planning: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function PATCH(request: Request) {
  const { session, error } = await requirePermission("events");
  if (error) return error;

  const body = await request.json();
  const eventId = String(body.eventId ?? "").trim();
  const nextStatus = String(body.status ?? "").trim();
  if (!eventId || !Object.prototype.hasOwnProperty.call(allowedTransitions, nextStatus)) {
    return NextResponse.json({ error: "A valid event and status are required" }, { status: 400 });
  }

  const current = await query("SELECT id, status, starts_at FROM events WHERE id = $1", [eventId]);
  const event = current.rows[0];
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!allowedTransitions[event.status]?.includes(nextStatus)) {
    return NextResponse.json({ error: `Cannot move an event from ${event.status} to ${nextStatus}` }, { status: 409 });
  }
  if (nextStatus === "completed" && new Date(event.starts_at) > new Date()) {
    return NextResponse.json({ error: "An event can only be completed after its scheduled start" }, { status: 400 });
  }
  if (nextStatus === "in_progress" && new Date(event.starts_at) > new Date()) {
    return NextResponse.json({ error: "An event cannot be in progress before its scheduled start" }, { status: 400 });
  }

  const updated = await query(
    "UPDATE events SET status = $1 WHERE id = $2 RETURNING id, name, client_name, venue, starts_at, ends_at, guest_count, status, notes, receipt_id",
    [nextStatus, eventId]
  );
  return NextResponse.json({ event: updated.rows[0], changedBy: session.id });
}
