import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Check-in guest to room
export async function POST(request: NextRequest) {
  try {
    const { error } = await requirePermission("checkIn");
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
      // Update reservation status to checked_in
      const resResult = await client.query(
        `
        UPDATE reservations 
        SET status = 'checked_in', room_id = $1, updated_at = NOW()
        WHERE id = $2
          AND status IN ('confirmed', 'pending')
          AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = $1
              AND rooms.is_active = true
              AND rooms.status IN ('available', 'dirty', 'cleaning')
          )
        RETURNING *
        `,
        [roomId, reservationId]
      );

      if (resResult.rowCount === 0) {
        throw new Error("Reservation not found");
      }

      // Update room status to occupied
      const roomResult = await client.query(
        `
        UPDATE rooms
        SET status = 'occupied', current_guest_id = (SELECT guest_id FROM reservations WHERE id = $1), updated_at = NOW()
        WHERE id = $2 AND status IN ('available', 'dirty', 'cleaning')
        `,
        [reservationId, roomId]
      );
      if (roomResult.rowCount === 0) {
        throw new Error("Room is no longer available");
      }

      // Create guest folio
      await client.query(
        `
        INSERT INTO guest_folios (reservation_id, room_charge, total_charges, balance)
        SELECT $1, rt.base_price, rt.base_price, rt.base_price
        FROM reservations r
        JOIN room_types rt ON rt.id = r.room_type_id
        WHERE r.id = $1
          AND NOT EXISTS (
            SELECT 1 FROM guest_folios gf WHERE gf.reservation_id = $1
          )
        `,
        [reservationId]
      );

      await client.query(
        `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, room_id, amount, description, metadata)
         VALUES ('checked_in', 'reservation', $1, $1, (SELECT guest_id FROM reservations WHERE id = $1), $2, 0, $3, $4)`,
        [reservationId, roomId, `Guest checked into room ${roomId}`, JSON.stringify({ source: "hotel", roomId })]
      );

      return resResult.rows[0];
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error checking in guest:", error);
    return NextResponse.json(
      { error: "Failed to check in guest" },
      { status: 500 }
    );
  }
}
