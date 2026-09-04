import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const { error } = await requirePermission("reservations");
    if (error) return error;
    const body = await request.json();
    const { guestId, roomTypeId, checkInDate, checkOutDate, numberOfGuests = 1, roomCount, totalPrice = 0, source = "walk_in", createdBy } = body;
    const count = Number(roomCount);
    if (!guestId || !roomTypeId || !checkInDate || !checkOutDate || !Number.isInteger(count) || count < 2 || count > 20) return NextResponse.json({ error: "A group booking requires between 2 and 20 rooms" }, { status: 400 });
    if (new Date(checkOutDate) <= new Date(checkInDate)) return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    const result = await transaction(async (client) => {
      const available = await client.query(`SELECT (SELECT COUNT(*) FROM rooms WHERE room_type_id = $3 AND is_active = true AND status = 'available') - (SELECT COUNT(*) FROM reservations WHERE room_type_id = $3 AND status IN ('confirmed', 'checked_in') AND check_in_date < $2 AND check_out_date > $1) AS available`, [checkInDate, checkOutDate, roomTypeId]);
      if (Number(available.rows[0]?.available ?? 0) < count) throw new Error(`Only ${Math.max(0, Number(available.rows[0]?.available ?? 0))} rooms are available for these dates`);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('kumbiapp-group-booking-number'))`);
      const ref = await client.query(`SELECT 'GRP' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || LPAD((COUNT(*) + 1)::text, 4, '0') AS reference FROM booking_groups WHERE created_at::date = CURRENT_DATE`);
      const bookingReference = ref.rows[0].reference;
      const group = await client.query(`INSERT INTO booking_groups (booking_reference, primary_guest_id, check_in_date, check_out_date, total_price, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [bookingReference, guestId, checkInDate, checkOutDate, Number(totalPrice) || 0, createdBy || null]);
      const reservations = [];
      for (let index = 0; index < count; index++) {
        const reservationNumber = `${bookingReference}-${String(index + 1).padStart(2, "2")}`;
        const inserted = await client.query(`INSERT INTO reservations (reservation_number, guest_id, room_type_id, check_in_date, check_out_date, number_of_guests, total_price, source, created_by, booking_group_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed') RETURNING *`, [reservationNumber, guestId, roomTypeId, checkInDate, checkOutDate, numberOfGuests, (Number(totalPrice) || 0) / count, source, createdBy || null, group.rows[0].id]);
        reservations.push(inserted.rows[0]);
      }
      return { group: group.rows[0], reservations };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating group reservation:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create group reservation" }, { status: 500 });
  }
}
