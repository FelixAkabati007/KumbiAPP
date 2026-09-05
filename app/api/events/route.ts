import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";

export async function GET() {
  const { error } = await requirePermission("events");
  if (error) return error;

  const result = await query(`
    SELECT id, name, client_name, venue, starts_at, ends_at, guest_count, status, notes
    FROM events
    WHERE status <> 'cancelled'
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
