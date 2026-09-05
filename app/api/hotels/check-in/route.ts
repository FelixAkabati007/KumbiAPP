import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Check-in guest to room
export async function POST(request: NextRequest) {
  try {
    const { session, error } = await requirePermission("checkIn");
    if (error) return error;

    const { reservationId, roomId } = await request.json();

    if (!reservationId || !roomId) {
      return NextResponse.json(
        { error: "Reservation ID and Room ID are required" },
        { status: 400 }
      );
    }

    // Use transaction to ensure both operations succeed
    const result = await transaction(async (client) => {
      const roomResult = await client.query(
        `SELECT id FROM rooms WHERE id = $1 AND is_active = true AND status IN ('available', 'dirty', 'cleaning') FOR UPDATE`,
        [roomId]
      );
      if (roomResult.rowCount === 0) throw new Error("Room is no longer available");

      const resResult = await client.query(
        `UPDATE reservations SET status = 'checked_in', room_id = $1, updated_at = NOW()
         WHERE id = $2 AND status IN ('confirmed', 'pending') RETURNING *`,
        [roomId, reservationId]
      );

      if (resResult.rowCount === 0) {
        throw new Error("Reservation not found");
      }

      // Update room status to occupied
      const updatedRoomResult = await client.query(
        `UPDATE rooms SET status = 'occupied', current_guest_id = (SELECT guest_id FROM reservations WHERE id = $1), updated_at = NOW()
         WHERE id = $2 AND status IN ('available', 'dirty', 'cleaning')`,
        [reservationId, roomId]
      );
      if (updatedRoomResult.rowCount === 0) {
        throw new Error("Room is no longer available");
      }

      // VIP authorizations waive the guest-facing room charge while preserving the stay event.
      const vipAuthorization = await client.query(`SELECT id, room_waived, approved_amount, COALESCE((SELECT SUM(amount_used) FROM complimentary_authorization_usage WHERE authorization_id = ca.id), 0) AS used_amount FROM complimentary_authorizations ca WHERE ca.reservation_id = $1 AND ca.status = 'active' AND ca.valid_until > now() AND ca.room_waived = true ORDER BY ca.created_at DESC LIMIT 1 FOR UPDATE`, [reservationId]);
      const vipRoom = vipAuthorization.rows[0];
      const roomChargeExpression = vipRoom ? "0" : "rt.base_price";
      await client.query(
        `
        INSERT INTO guest_folios (reservation_id, room_charge, total_charges, balance)
        SELECT $1, ${roomChargeExpression}, ${roomChargeExpression}, ${roomChargeExpression}
        FROM reservations r
        JOIN room_types rt ON rt.id = r.room_type_id
        WHERE r.id = $1
          AND NOT EXISTS (SELECT 1 FROM guest_folios gf WHERE gf.reservation_id = $1)
        `,
        [reservationId]
      );
      await client.query(
        `INSERT INTO guest_folio_items
          (reservation_id, folio_id, category, description, quantity, unit_amount, total_amount, source_type, source_id)
         SELECT $1::uuid, gf.id, 'room', 'Room accommodation', 1, gf.room_charge, gf.room_charge, 'check_in', $2::text
         FROM guest_folios gf
         WHERE gf.reservation_id = $1::uuid
           AND NOT EXISTS (
             SELECT 1 FROM guest_folio_items gfi
             WHERE gfi.reservation_id = $1::uuid AND gfi.source_type = 'check_in'
           )`,
        [reservationId, String(reservationId)]
      );

      if (vipRoom) {
        await client.query(`INSERT INTO complimentary_authorization_usage (authorization_id, transaction_id, applied_by, transaction_type, amount_used, note) SELECT $1, $2, $3, 'room_stay', rt.base_price, 'Room charge waived at VIP check-in' FROM reservations r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = $2`, [vipRoom.id, reservationId, String(session?.id || "system")]);
      }

      await client.query(
        `INSERT INTO reservation_room_changes
          (reservation_id, previous_room_type_id, new_room_type_id, previous_room_id, new_room_id, rate_difference, adjustment_type, reason, approval_status, changed_by)
         SELECT r.id, r.room_type_id, rm.room_type_id, NULL, rm.id, 0, 'same_price', $3, 'not_required', $4
         FROM reservations r
         JOIN rooms rm ON rm.id = $2
         WHERE r.id = $1`,
        [reservationId, roomId, "Room assigned during check-in", session?.id || null]
      );

      await client.query(
        `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, description, metadata)
         VALUES ('checked_in', 'reservation', $1, $1, $2, $3, 0, $4, $5)`,
        [String(reservationId), String(resResult.rows[0].guest_id), String(roomId), `Guest checked into room ${roomId}`, JSON.stringify({ source: "hotel", roomId, approvalStatus: "not_required" })]
      );

      const receiptResult = await client.query(
        `INSERT INTO hotel_receipts (reservation_id, folio_id, order_id, order_number, receipt_type, snapshot, created_by)
         SELECT r.id, gf.id, r.id::text, r.reservation_number, 'check_in',
           jsonb_build_object(
             'guestName', concat_ws(' ', g.first_name, g.last_name),
             'roomNumber', rm.room_number,
             'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'total_amount', i.total_amount) ORDER BY i.created_at) FROM guest_folio_items i WHERE i.reservation_id = r.id), '[]'::jsonb),
             'total', COALESCE(gf.total_charges, 0)
           ), NULL
         FROM reservations r
         JOIN guests g ON g.id = r.guest_id
         JOIN rooms rm ON rm.id = r.room_id
         JOIN guest_folios gf ON gf.reservation_id = r.id
         WHERE r.id = $1 RETURNING id`,
        [reservationId]
      );

      return { ...resResult.rows[0], receiptId: receiptResult.rows[0]?.id, orderId: String(reservationId), orderNumber: resResult.rows[0].reservation_number };

    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error checking in guest:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check in guest" },
      { status: 500 }
    );
  }
}
