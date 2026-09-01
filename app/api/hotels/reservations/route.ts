import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Get all reservations with optional filtering
export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission("reservations");
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const guestId = searchParams.get("guestId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let sql = `
      SELECT r.*, g.first_name, g.last_name, g.email, g.phone, rt.name as room_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN room_types rt ON r.room_type_id = rt.id
    `;
    const params: (string | undefined)[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push(`r.status = $${params.length + 1}`);
      params.push(status);
    }

    if (guestId) {
      conditions.push(`r.guest_id = $${params.length + 1}`);
      params.push(guestId);
    }

    if (startDate) {
      conditions.push(`r.check_in_date >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`r.check_out_date <= $${params.length + 1}`);
      params.push(endDate);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += ` ORDER BY r.check_in_date DESC LIMIT 500`;

    const result = await query(sql, params);
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Error fetching reservations:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}

// Create a new reservation
export async function POST(request: NextRequest) {
  try {
    const { error } = await requirePermission("reservations");
    if (error) return error;

    const {
      guestId,
      roomTypeId,
      checkInDate,
      checkOutDate,
      numberOfGuests,
      totalPrice,
      specialRequests,
      source,
      promoCode,
      discountPercent,
      createdBy,
    } = await request.json();

    if (!guestId || !roomTypeId || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    if (!Number.isFinite(checkIn.getTime()) || !Number.isFinite(checkOut.getTime()) || checkOut <= checkIn) {
      return NextResponse.json(
        { error: "Check-out must be after check-in" },
        { status: 400 }
      );
    }

    // Enforce capacity on the server so concurrent clients cannot book a
    // fully occupied room type by bypassing the client dialog.
    const availability = await query<{ available: string }>(
      `SELECT (
         SELECT COUNT(*) FROM rooms r
         WHERE r.room_type_id = $3 AND r.is_active = true AND r.status = 'available'
       ) - (
         SELECT COUNT(*) FROM reservations existing
         WHERE existing.room_type_id = $3
           AND existing.status IN ('confirmed', 'checked_in')
           AND existing.check_in_date < $2
           AND existing.check_out_date > $1
       ) AS available`,
      [checkInDate, checkOutDate, roomTypeId]
    );
    if (Number(availability.rows[0]?.available ?? 0) <= 0) {
      return NextResponse.json(
        { error: "No rooms are available for the selected dates" },
        { status: 409 }
      );
    }

    const result = await transaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('kumbiapp-reservation-number'))`);
      const reservationNumberResult = await client.query(`SELECT 'RES' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || LPAD((COUNT(*) + 1)::text, 5, '0') AS number FROM reservations WHERE created_at::date = CURRENT_DATE`);
      const reservationNumber = reservationNumberResult.rows[0]?.number;
      if (!reservationNumber) throw new Error("Unable to generate reservation number");

      const inserted = await client.query(
        `INSERT INTO reservations (reservation_number, guest_id, room_type_id, check_in_date, check_out_date, number_of_guests, total_price, special_requests, source, promo_code, discount_percent, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed') RETURNING *`,
        [reservationNumber, guestId, roomTypeId, checkInDate, checkOutDate, numberOfGuests || 1, totalPrice || 0, specialRequests || null, source || "walk_in", promoCode || null, discountPercent || 0, createdBy || null]
      );

      await client.query(
        `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, reservation_id, guest_id, amount, description, metadata)
         VALUES ('booking_created', 'reservation', $1, $1, $2, $3, $4, $5)`,
        [String(inserted.rows[0].id), inserted.rows[0].guest_id, Number(inserted.rows[0].total_price) || 0, `Booking ${reservationNumber} created`, JSON.stringify({ source: "hotel", reservationNumber, sourceChannel: source || "walk_in" })]
      );
      return inserted.rows[0];
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}
