import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { z } from "zod";

const reservationSchema = z.object({
  guestId: z.string().uuid(),
  roomTypeId: z.string().uuid(),
  checkInDate: z.coerce.date(),
  checkOutDate: z.coerce.date(),
  numberOfGuests: z.coerce.number().int().min(1).max(50).default(1),
  specialRequests: z.string().max(2000).optional(),
  source: z.string().max(50).optional(),
  promoCode: z.string().max(50).optional(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  createdBy: z.string().uuid().optional(),
});

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
      SELECT r.*, bg.booking_reference as group_booking_reference, g.first_name, g.last_name, g.email, g.phone, rt.name as room_type_name
      FROM reservations r
      LEFT JOIN booking_groups bg ON bg.id = r.booking_group_id
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
  const { session, error } = await requirePermission("reservations");
    if (error) return error;

    const parsed = reservationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid reservation details" }, { status: 400 });
    }
    const { guestId, roomTypeId, numberOfGuests, specialRequests, source, promoCode, discountPercent, createdBy } = parsed.data;
    let { checkInDate, checkOutDate } = parsed.data;
    const roomTypeNameResult = await query<{ name: string }>(`SELECT name FROM room_types WHERE id = $1 AND is_active = true`, [roomTypeId]);
    const roomTypeName = roomTypeNameResult.rows[0]?.name?.trim().toLowerCase();
    const isShortStay = roomTypeName === "short time" || roomTypeName === "short stay";
    if (isShortStay) {
      const requestedDuration = checkOutDate.getTime() - checkInDate.getTime();
      if (requestedDuration !== 2 * 60 * 60 * 1000 || checkInDate.toDateString() !== checkOutDate.toDateString()) {
        return NextResponse.json({ error: "Short time bookings are limited to the same day and exactly two hours. Book a normal overnight room for longer stays." }, { status: 400 });
      }
    }
    if (checkOutDate <= checkInDate) {
      return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    }
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000);
    const rateResult = await query<{ base_price: string }>(`SELECT base_price FROM room_types WHERE id = $1 AND is_active = true`, [roomTypeId]);
    const basePrice = Number(rateResult.rows[0]?.base_price);
    if (!Number.isFinite(basePrice)) {
      return NextResponse.json({ error: "Room type is not available" }, { status: 409 });
    }
    const totalPrice = Number((basePrice * nights * (1 - discountPercent / 100)).toFixed(2));

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
      const reservationNumberResult = await client.query(`SELECT 'RES' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || LPAD((COUNT(*) + 1)::text, 5, '0') AS number FROM reservations WHERE created_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date`);
      const reservationNumber = reservationNumberResult.rows[0]?.number;
      if (!reservationNumber) throw new Error("Unable to generate reservation number");

      const inserted = await client.query(
        `INSERT INTO reservations (reservation_number, guest_id, room_type_id, check_in_date, check_out_date, number_of_guests, total_price, special_requests, source, promo_code, discount_percent, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed') RETURNING *`,
        [reservationNumber, guestId, roomTypeId, checkInDate, checkOutDate, numberOfGuests || 1, totalPrice || 0, specialRequests || null, source || "walk_in", promoCode || null, discountPercent || 0, session.id]
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
