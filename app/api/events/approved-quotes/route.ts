import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET(request: Request) {
  const { error } = await requirePermission("events");
  if (error) return error;
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  const result = await query(
    `SELECT id, status, total, currency, created_at
     FROM event_quotes
     WHERE event_id = $1 AND status IN ('approved', 'accepted')
     ORDER BY created_at DESC`,
    [eventId],
  );
  return NextResponse.json({ quotes: result.rows });
}
