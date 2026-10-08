import type { PoolClient } from "@neondatabase/serverless";
import { SHORT_STAY_DURATION_MINUTES, isShortStayRoom } from "@/lib/hotels/short-stay";

export async function syncShortStayRoomCharges(client: PoolClient, reservationId: string) {
  const reservation = await client.query<{
    room_id: string | null;
    check_in_date: string;
    room_type_name: string | null;
    room_number: string | null;
    room_rate: string | null;
  }>(
    `SELECT r.room_id, r.check_in_date, rm.room_number, rt.name AS room_type_name,
            COALESCE(rm.price, rt.base_price) AS room_rate
     FROM reservations r
     LEFT JOIN rooms rm ON rm.id = r.room_id
     LEFT JOIN room_types rt ON rt.id = rm.room_type_id
     WHERE r.id = $1::uuid AND r.status = 'checked_in'
     FOR UPDATE OF r`,
    [reservationId],
  );

  const stay = reservation.rows[0];
  if (!stay || !isShortStayRoom(stay.room_number, stay.room_type_name) || !stay.room_rate) {
    return { addedBlocks: 0, billableBlocks: 0 };
  }

  const folio = await client.query<{ id: string }>(
    `SELECT id FROM guest_folios WHERE reservation_id = $1::uuid FOR UPDATE`,
    [reservationId],
  );
  if (folio.rowCount !== 1) return { addedBlocks: 0, billableBlocks: 0 };

  const elapsed = Math.max(0, Date.now() - new Date(stay.check_in_date).getTime());
  const billableBlocks = Math.max(1, Math.ceil(elapsed / (SHORT_STAY_DURATION_MINUTES * 60_000)));
  const inserted = await client.query(
    `INSERT INTO guest_folio_items
      (reservation_id, folio_id, category, description, quantity, unit_amount, total_amount, source_type, source_id)
     SELECT $1::uuid, $2::uuid, 'room', CONCAT('Short-stay room block ', block_number, ' (2 hours 10 minutes)'), 1, $3::numeric, $3::numeric, 'system', $1::uuid::text || ':short-stay:' || block_number
     FROM generate_series(2, $4::integer) AS blocks(block_number)
     WHERE NOT EXISTS (
       SELECT 1 FROM guest_folio_items existing
       WHERE existing.reservation_id = $1::uuid AND existing.source_type = 'system'
         AND existing.source_id = $1 || ':short-stay:' || block_number
     )
     RETURNING id`,
    [reservationId, folio.rows[0].id, stay.room_rate, billableBlocks],
  );

  await client.query(
    `UPDATE guest_folios SET room_charge = COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = $1 AND category IN ('room', 'room_extension')), 0),
      total_charges = COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = $1), 0),
      balance = GREATEST(0, COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = $1), 0) - COALESCE(paid_amount, 0)), last_updated = NOW()
     WHERE id = $1`,
    [folio.rows[0].id],
  );

  return { addedBlocks: inserted.rowCount ?? 0, billableBlocks };
}

export async function syncOverdueRoomCharges(client: PoolClient, reservationId: string) {
  const reservation = await client.query<{
    room_id: string | null;
    check_in_date: string;
    check_out_date: string;
    room_rate: string | null;
  }>(
    `SELECT r.room_id, r.check_in_date, r.check_out_date, rm.price AS room_rate
     FROM reservations r
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.id = $1::uuid AND r.status = 'checked_in'
     FOR UPDATE OF r`,
    [reservationId]
  );

  const stay = reservation.rows[0];
  if (!stay || !stay.room_rate || !stay.check_out_date) {
    return { addedNights: 0, overdueNights: 0 };
  }

  const inserted = await client.query(
    `INSERT INTO guest_folio_items
      (reservation_id, folio_id, category, description, quantity, unit_amount, total_amount, source_type, source_id)
     SELECT r.id, gf.id, 'room',
            CONCAT('Overdue room stay - night of ', TO_CHAR(night_date, 'DD Mon YYYY')),
            1, $2::numeric, $2::numeric, 'system', r.id::text || ':' || night_date::text
     FROM reservations r
     JOIN guest_folios gf ON gf.reservation_id = r.id
     CROSS JOIN LATERAL generate_series(r.check_out_date, CURRENT_DATE - 1, INTERVAL '1 day') AS nights(night_date)
     WHERE r.id = $1::uuid
       AND r.status = 'checked_in'
       AND CURRENT_DATE > r.check_out_date
       AND NOT EXISTS (
         SELECT 1 FROM guest_folio_items existing
         WHERE existing.reservation_id = r.id
           AND existing.source_type = 'system'
           AND existing.source_id = r.id::text || ':' || night_date::text
       )
     RETURNING id`,
    [reservationId, stay.room_rate]
  );

  await client.query(
    `UPDATE guest_folio_items item
     SET unit_amount = 0,
         total_amount = 0,
         description = CASE WHEN item.description LIKE '% · Complimentary%' THEN item.description ELSE item.description || ' · Complimentary' END
     WHERE item.reservation_id = $1::uuid
       AND item.source_type = 'restaurant_order'
       AND EXISTS (
         SELECT 1 FROM complimentary_authorizations ca
         WHERE ca.reservation_id = item.reservation_id
           AND ca.status = 'active'
           AND ca.valid_from <= NOW()
           AND ca.valid_until > NOW()
           AND ca.folio_waived = true
           AND ca.scope IN ('restaurant', 'both')
       )`,
    [reservationId]
  );

  await client.query(
    `UPDATE guest_folios gf
     SET room_charge = COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = gf.id AND category IN ('room', 'room_extension')), 0),
         service_charges = COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = gf.id AND category = 'service'), 0),
         food_charges = COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = gf.id AND category = 'food'), 0),
         other_charges = COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = gf.id AND category NOT IN ('room', 'room_extension', 'service', 'food')), 0),
         total_charges = COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = gf.id), 0),
         balance = GREATEST(0, COALESCE((SELECT SUM(total_amount) FROM guest_folio_items WHERE folio_id = gf.id), 0) - COALESCE(gf.paid_amount, 0)),
         last_updated = NOW()
     WHERE gf.reservation_id = $1`,
    [reservationId]
  );

  const overdue = await client.query<{ count: string }>(
    `SELECT GREATEST(0, CURRENT_DATE - check_out_date)::text AS count
     FROM reservations WHERE id = $1::uuid`,
    [reservationId]
  );

  return { addedNights: inserted.rowCount ?? 0, overdueNights: Number(overdue.rows[0]?.count ?? 0) };
}
