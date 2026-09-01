import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function POST(request: Request) {
  try {
    const { error } = await requirePermission("payments");
    if (error) return error;
    const body = await request.json();
    const { eventType, entityType, entityId, reservationId, guestId, roomId, amount = 0, currency = "GHS", description, metadata = {}, occurredAt, createdBy } = body;
    if (!eventType || !entityType || !description) return NextResponse.json({ error: "eventType, entityType, and description are required" }, { status: 400 });
    const result = await query(
      `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, currency, description, metadata, occurred_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [eventType, entityType, entityId ?? null, reservationId ?? null, guestId ?? null, roomId ?? null, Number(amount) || 0, currency, description, JSON.stringify(metadata), occurredAt ?? new Date().toISOString(), createdBy ?? null]
    );
    return NextResponse.json({ success: true, id: result.rows[0]?.id });
  } catch (error) {
    console.error("Failed to log hotel activity:", error);
    return NextResponse.json({ error: "Failed to log hotel activity" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { error } = await requirePermission("payments");
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get("eventType");
    const reservationId = searchParams.get("reservationId");
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 500), 1), 1000);
    const params: (string | number)[] = [];
    const conditions: string[] = [];
    if (eventType) { conditions.push(`event_type = $${params.length + 1}`); params.push(eventType); }
    if (reservationId) { conditions.push(`reservation_id = $${params.length + 1}`); params.push(Number(reservationId)); }
    let sql = `SELECT id, event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, currency, description, metadata, occurred_at, created_by FROM hotel_activity_ledger`;
    if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += ` ORDER BY occurred_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch hotel activity:", error);
    return NextResponse.json({ error: "Failed to fetch hotel activity" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
