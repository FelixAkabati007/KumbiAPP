import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Generate reservation number
async function generateReservationNumber(): Promise<string> {
  const result = await query(
    `SELECT COUNT(*) as count FROM reservations WHERE created_at > NOW() - INTERVAL '1 day'`
  );
  const count = (result.rows[0]?.count || 0) + 1;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `RES${date}${String(count).padStart(5, "0")}`;
}

// Get all reservations with optional filtering
export async function GET(request: NextRequest) {
  try {
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
    const response = NextResponse.json(result.rows);
    response.headers.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    return response;
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

    const reservationNumber = await generateReservationNumber();

    const result = await query(
      `
      INSERT INTO reservations (
        reservation_number, guest_id, room_type_id, check_in_date, check_out_date,
        number_of_guests, total_price, special_requests, source, promo_code,
        discount_percent, created_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed')
      RETURNING *
      `,
      [
        reservationNumber,
        guestId,
        roomTypeId,
        checkInDate,
        checkOutDate,
        numberOfGuests || 1,
        totalPrice || 0,
        specialRequests || null,
        source || "walk_in",
        promoCode || null,
        discountPercent || 0,
        createdBy || null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}
