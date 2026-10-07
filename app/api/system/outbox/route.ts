import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function POST() {
  const auth = await requirePermission("reports");
  if (auth.error) return auth.error;

  const processed = await transaction(async (client) => {
    const reminderResult = await client.query(
      `WITH due AS (
         SELECT r.id, r.reservation_number, r.checkout_due_at, r.room_id, r.guest_id
         FROM reservations r
         WHERE r.stay_type = 'short_stay'
           AND r.status = 'checked_in'
           AND r.checkout_due_at IS NOT NULL
           AND r.reminder_sent_at IS NULL
           AND r.checkout_due_at <= now() + interval '20 minutes'
           AND r.checkout_due_at > now()
         FOR UPDATE SKIP LOCKED
       ), marked AS (
         UPDATE reservations r
         SET reminder_sent_at = now(), updated_at = now()
         FROM due
         WHERE r.id = due.id
         RETURNING due.*
       )
       INSERT INTO notifications (recipient_user_id, title, message, type)
       SELECT u.id,
              'Short-stay checkout reminder',
              CONCAT('Reservation ', marked.reservation_number, ' is due to check out in 20 minutes. Please ask the guest to prepare and leave the premises to avoid additional charges.'),
              'short_stay_checkout_reminder'
       FROM marked
       JOIN users u ON u.role::text = 'reception' AND u.is_active = true
       RETURNING id`,
    );

    const overstayResult = await client.query(
      `WITH due AS (
         SELECT r.id, r.reservation_number, r.checkout_due_at, r.room_id, r.guest_id
         FROM reservations r
         WHERE r.stay_type = 'short_stay'
           AND r.status = 'checked_in'
           AND r.checkout_due_at IS NOT NULL
           AND r.checkout_due_at <= now()
           AND r.overstay_started_at IS NULL
         FOR UPDATE SKIP LOCKED
       ), marked AS (
         UPDATE reservations r
         SET overstay_started_at = now(), updated_at = now()
         FROM due
         WHERE r.id = due.id
         RETURNING due.*
       ), ledger AS (
         INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, description, metadata)
         SELECT 'short_stay_overdue', 'reservation', id::text, id::text, guest_id::text, room_id::text, 0,
                CONCAT('Short stay exceeded checkout deadline for reservation ', reservation_number),
                jsonb_build_object('checkoutDueAt', checkout_due_at, 'source', 'system')
         FROM marked
         RETURNING reservation_id
       )
       SELECT COUNT(*)::int AS count FROM ledger`,
    );

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
      await client.query(
        `UPDATE rooms SET status = 'cleaning', updated_at = NOW()
         WHERE id = $1 AND is_active = true AND status = 'dirty'
           AND NOT EXISTS (
             SELECT 1 FROM reservations
             WHERE room_id = rooms.id AND status = 'checked_in'
           )`,
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
    return {
      outbox: results,
      shortStayReminders: reminderResult.rowCount ?? 0,
      shortStayOverstays: Number(overstayResult.rows[0]?.count ?? 0),
    };
  });

  return NextResponse.json({ ...processed, count: processed.outbox.length });
}

export async function GET() {
  const auth = await requirePermission("reports");
  if (auth.error) return auth.error;
  const result = await query(
    `SELECT status, count(*)::int AS count FROM operational_outbox GROUP BY status ORDER BY status`,
  );
  return NextResponse.json({ statuses: result.rows });
}
