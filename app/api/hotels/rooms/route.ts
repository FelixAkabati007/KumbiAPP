import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Get all rooms with optional filtering
export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission("rooms");
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const roomTypeId = searchParams.get("roomTypeId");

    let sql = `
      SELECT r.id, r.room_number, r.floor, r.building, r.status,
             r.room_type_id, r.notes, r.current_guest_id,
             rt.name as room_type_name, rt.base_price,
             COALESCE(r.price, rt.base_price) as price,
             r.images,
             g.first_name AS guest_first_name,
             g.last_name AS guest_last_name,
             res.check_in_date, res.check_out_date,
             hk.assigned_to AS assigned_housekeeper_id,
             hu.name AS assigned_housekeeper_name
      FROM rooms r
      JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN guests g ON g.id = r.current_guest_id
      LEFT JOIN LATERAL (
        SELECT check_in_date, check_out_date
        FROM reservations
        WHERE room_id = r.id AND status = 'checked_in'
        ORDER BY updated_at DESC
        LIMIT 1
      ) res ON true
      LEFT JOIN LATERAL (
        SELECT assigned_to
        FROM housekeeping_tasks
        WHERE room_id = r.id AND status IN ('pending', 'in_progress')
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      ) hk ON true
      LEFT JOIN users hu ON hu.id = hk.assigned_to
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
    const { error } = await requirePermission("rooms");
    if (error) return error;

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
