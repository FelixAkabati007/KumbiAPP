import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const { error } = await requirePermission("events");
  if (error) return error;
  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  const result = await query(`SELECT id, event_id, amount, reason, status, requested_by, approved_by, approved_at, rejection_reason, created_at, updated_at FROM event_refund_requests WHERE event_id = $1 ORDER BY created_at DESC`, [eventId]);
  return NextResponse.json({ refunds: result.rows });
}

export async function POST(request: Request) {
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const body = await request.json();
  const eventId = String(body.eventId ?? "").trim();
  const amount = Number(body.amount);
  const reason = String(body.reason ?? "").trim();
  if (!eventId || !Number.isFinite(amount) || amount <= 0 || !reason) return NextResponse.json({ error: "Event, positive amount, and reason are required" }, { status: 400 });
  const result = await query(`INSERT INTO event_refund_requests (event_id, amount, reason, requested_by) VALUES ($1, $2, $3, $4) RETURNING id, event_id, amount, reason, status, created_at`, [eventId, amount, reason, session.id]);
  return NextResponse.json({ refund: result.rows[0] }, { status: 201 });
}
