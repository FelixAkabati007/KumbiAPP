import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function POST() {
  const auth = await requirePermission("reports");
  if (auth.error) return auth.error;

  const processed = await transaction(async (client) => {
    const claimed = await client.query(
      `UPDATE operational_outbox
       SET status = 'processing', attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM operational_outbox
         WHERE status = 'pending' AND available_at <= now()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 50
       )
       RETURNING id, event_type, aggregate_type, aggregate_id, payload, attempts`,
    );
    const results = [];
    for (const event of claimed.rows) {
      try {
    if (event.event_type === "hotel.checked_out") {
      const payload = event.payload as { roomId: string; reservationId: string; guestId: string; paid: number };
      await client.query(
        `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, description, metadata)
         VALUES ('checked_out', 'reservation', $1, $1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT DO NOTHING`,
        [payload.reservationId, payload.guestId, payload.roomId, payload.paid, `Guest checked out of room ${payload.roomId}`, JSON.stringify({ source: "hotel", balancePaid: payload.paid })],
      );
      await client.query(
        `INSERT INTO housekeeping_tasks (room_id, task_type, status, priority)
         SELECT $1, 'cleaning', 'pending', 'normal'
         WHERE NOT EXISTS (SELECT 1 FROM housekeeping_tasks WHERE room_id = $1 AND task_type = 'cleaning' AND status IN ('pending', 'in_progress'))`,
        [payload.roomId],
      );
    }

    await client.query(
      `INSERT INTO operational_reconciliation (aggregate_type, aggregate_id, source_table, source_id, status, details)
           VALUES ($1, $2, 'operational_outbox', $3, 'observed', $4::jsonb)
           ON CONFLICT (aggregate_type, aggregate_id, source_table, source_id)
           DO UPDATE SET status = 'observed', details = EXCLUDED.details, checked_at = now()`,
          [event.aggregate_type, event.aggregate_id, event.id, JSON.stringify({ eventType: event.event_type, payload: event.payload })],
        );
        await client.query(
          `UPDATE operational_outbox SET status = 'processed', processed_at = now(), last_error = NULL WHERE id = $1`,
          [event.id],
        );
        results.push({ id: event.id, status: "processed" });
      } catch (error) {
        await client.query(
          `UPDATE operational_outbox SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END, available_at = now() + interval '1 minute', last_error = $2 WHERE id = $1`,
          [event.id, error instanceof Error ? error.message : "Unknown outbox error"],
        );
        results.push({ id: event.id, status: "retrying" });
      }
    }
    return results;
  });

  return NextResponse.json({ processed, count: processed.length });
}

export async function GET() {
  const auth = await requirePermission("reports");
  if (auth.error) return auth.error;
  const result = await query(
    `SELECT status, count(*)::int AS count FROM operational_outbox GROUP BY status ORDER BY status`,
  );
  return NextResponse.json({ statuses: result.rows });
}
