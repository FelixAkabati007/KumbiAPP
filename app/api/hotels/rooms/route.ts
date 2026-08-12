import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Get all rooms with optional filtering
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const roomTypeId = searchParams.get("roomTypeId");

    let sql = `
      SELECT r.id, r.room_number, r.floor, r.building, r.status,
             r.room_type_id, r.notes,
             rt.name as room_type_name, rt.base_price,
             COALESCE(r.price, rt.base_price) as price,
             r.images
      FROM rooms r
      JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.is_active = true
    `;
    const params: (string | undefined)[] = [];

    if (status) {
      sql += ` AND r.status = $${params.length + 1}`;
      params.push(status);
    }

    if (roomTypeId) {
      sql += ` AND r.room_type_id = $${params.length + 1}`;
      params.push(roomTypeId);
    }

    sql += ` ORDER BY r.floor ASC, r.room_number ASC`;

    const result = await query(sql, params);
    return NextResponse.json(result.rows, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching rooms:", error);
    return NextResponse.json(
      { error: "Failed to fetch rooms" },
      { status: 500 }
    );
  }
}

// Create a new room
export async function POST(request: NextRequest) {
  try {
    const {
      roomNumber,
      roomTypeId,
      floor,
      building,
      notes,
      price,
      images,
    } = await request.json();

    if (!roomNumber || !roomTypeId || !price) {
      return NextResponse.json(
        { error: "Room number, type, and price are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `
      INSERT INTO rooms (room_number, room_type_id, floor, building, status, notes, price, images)
      VALUES ($1, $2, $3, $4, 'available', $5, $6, $7)
      RETURNING *
      `,
      [roomNumber, roomTypeId, floor || null, building || null, notes || null, price, images || []]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating room:", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}
