import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { z } from "zod";

const schema = z.object({ roomTypeId: z.string().uuid(), roomId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(500) });

export async function POST(request: NextRequest, context: { params: Promise<{ reservationId: string }> }) {
  try {
    const { session, error } = await requirePermission("guestFolio");
    if (error) return error;
    const reservationId = (await context.params).reservationId;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid room change" }, { status: 400 });

    const result = await transaction(async (client) => {
      const reservation = await client.query(`SELECT r.id, r.room_id, r.room_type_id, r.status, rt.base_price AS current_rate FROM reservations r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = $1 FOR UPDATE`, [reservationId]);
      const current = reservation.rows[0];
      if (!current || current.status !== "checked_in") throw new Error("Only checked-in guests can change room type");
      const target = await client.query(`SELECT rt.id, rt.base_price, rm.id AS room_id FROM room_types rt LEFT JOIN rooms rm ON rm.room_type_id = rt.id AND rm.status IN ('available','cleaning') AND rm.is_active = true WHERE rt.id = $1 AND rt.is_active = true AND ($2::uuid IS NULL OR rm.id = $2::uuid) ORDER BY rm.id LIMIT 1 FOR UPDATE`, [parsed.data.roomTypeId, parsed.data.roomId || null]);
      const next = target.rows[0];
      if (!next) throw new Error("No available room matches the selected room type");
      const difference = Number(next.base_price) - Number(current.current_rate);
      await client.query(`UPDATE reservations SET room_type_id = $1, room_id = $2, updated_at = now() WHERE id = $3`, [next.id, next.room_id, reservationId]);
      await client.query(`UPDATE rooms SET status = 'available', current_guest_id = NULL, updated_at = now() WHERE id = $1`, [current.room_id]);
      await client.query(`UPDATE rooms SET status = 'occupied', current_guest_id = (SELECT guest_id FROM reservations WHERE id = $1), updated_at = now() WHERE id = $2`, [reservationId, next.room_id]);
      await client.query(`INSERT INTO reservation_room_changes (reservation_id, previous_room_type_id, new_room_type_id, previous_room_id, new_room_id, rate_difference, adjustment_type, reason, approval_status, changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'not_required',$9)`, [reservationId, current.room_type_id, next.id, current.room_id, next.room_id, difference, difference === 0 ? "same_price" : difference > 0 ? "upgrade" : "downgrade", parsed.data.reason, session.id]);
      if (difference !== 0) await client.query(`INSERT INTO guest_folio_items (reservation_id, folio_id, category, description, quantity, unit_amount, total_amount, source_type, created_by) SELECT $1, id, 'room', $2, 1, $3, $3, 'room_change', $4 FROM guest_folios WHERE reservation_id = $1`, [reservationId, `Room change adjustment: ${parsed.data.reason}`, difference, session.id]);
      await client.query(`INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, description, metadata) SELECT 'room_changed','reservation',$1,$1,guest_id,$2,$3,$4,$5::jsonb FROM reservations WHERE id = $1`, [reservationId, next.room_id, difference, "Room changed from checkout folio", JSON.stringify({ source: "hotel", reason: parsed.data.reason, newRoomTypeId: next.id })]);
      return { roomId: next.room_id, roomTypeId: next.id, rateDifference: difference };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Room change failed";
    return NextResponse.json({ error: message }, { status: message.startsWith("Only") || message.startsWith("No available") ? 409 : 500 });
  }
}
