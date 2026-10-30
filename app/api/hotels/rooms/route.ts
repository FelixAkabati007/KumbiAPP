import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, requireSession } from "@/lib/api-auth";

let roomsSchemaPromise: Promise<void> | null = null;

async function ensureRoomsExist() {
  if (!roomsSchemaPromise) {
    roomsSchemaPromise = (async () => {
      try {
        await query(`
          ALTER TABLE rooms
            ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2),
            ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb
        `);
      } catch {
        // Ignore if table or permissions prevent DDL
      }
    })();
  }
  await roomsSchemaPromise;

  try {
    const countRes = await query<{ total: number; active: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::int AS active
       FROM rooms`,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);
    const active = Number(countRes.rows[0]?.active ?? 0);

    if (total > 0 && active === 0) {
      await query(`UPDATE rooms SET is_active = true WHERE is_active = false`);
      return;
    }

    if (total === 0) {
      // Ensure standard and short-stay room types exist before seeding default rooms 1..20
      let typesRes = await query<{ id: string; name: string }>(
        `SELECT id, name FROM room_types WHERE COALESCE(is_active, true) = true ORDER BY base_price ASC`,
      );
      if (typesRes.rows.length === 0) {
        await query(`
          INSERT INTO room_types (name, description, base_price, max_occupants, is_active)
          VALUES
            ('Standard Room', 'Comfortable standard guest room', 350, 2, true),
            ('Executive Room', 'Spacious executive room', 500, 2, true),
            ('Short Stay', 'Short-stay guest room (Rooms 19 & 20)', 150, 2, true)
        `);
        typesRes = await query<{ id: string; name: string }>(
          `SELECT id, name FROM room_types WHERE COALESCE(is_active, true) = true ORDER BY base_price ASC`,
        );
      }

      const standardType =
        typesRes.rows.find((t) => /standard/i.test(t.name)) ?? typesRes.rows[0];
      const executiveType =
        typesRes.rows.find((t) => /executive|deluxe/i.test(t.name)) ?? standardType;
      const shortStayType =
        typesRes.rows.find((t) => /short/i.test(t.name)) ?? standardType;

      if (standardType) {
        for (let num = 1; num <= 20; num++) {
          const isShort = num === 19 || num === 20;
          const isExec = num >= 11 && num <= 18;
          const rtId = isShort
            ? shortStayType.id
            : isExec
              ? executiveType.id
              : standardType.id;
          const floor = num <= 10 ? 1 : 2;
          await query(
            `INSERT INTO rooms (room_number, room_type_id, floor, building, status, is_active)
             VALUES ($1, $2, $3, 'Main', 'available', true)
             ON CONFLICT (room_number) DO NOTHING`,
            [String(num), rtId, floor],
          );
        }
      }
    }
  } catch (err) {
    console.warn("ensureRoomsExist warning:", err);
  }
}

// Get all rooms with optional filtering
export async function GET(request: NextRequest) {
  try {
    const { error } = await requireSession();
    if (error) return error;

    await ensureRoomsExist();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const roomTypeId = searchParams.get("roomTypeId");
    const reservationId = searchParams.get("reservationId");

    const effectiveStatusExpr = `CASE
      WHEN res.status = 'checked_in' THEN 'occupied'
      WHEN r.status IN ('maintenance', 'out_of_order', 'cleaning', 'dirty') THEN r.status
      WHEN res.check_in_date IS NOT NULL AND r.status = 'occupied' THEN 'occupied'
      WHEN r.status = 'occupied' THEN 'available'
      ELSE COALESCE(r.status, 'available')
    END`;

    let sql = `
      SELECT r.id, r.room_number, r.floor, r.building,
             ${effectiveStatusExpr} AS status,
             r.room_type_id, r.notes,
             CASE WHEN res.check_in_date IS NULL THEN NULL ELSE r.current_guest_id END AS current_guest_id,
             COALESCE(rt.name, 'Standard Room') as room_type_name, rt.base_price,
             COALESCE(r.price, rt.base_price) as price,
             r.images,
             CASE WHEN res.check_in_date IS NULL THEN NULL ELSE g.first_name END AS guest_first_name,
             CASE WHEN res.check_in_date IS NULL THEN NULL ELSE g.last_name END AS guest_last_name,
             res.check_in_date, res.check_out_date,
             hk.assigned_to AS assigned_housekeeper_id,
             hu.name AS assigned_housekeeper_name
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN guests g ON g.id = r.current_guest_id
      LEFT JOIN LATERAL (
        SELECT check_in_date, check_out_date, status
        FROM reservations
        WHERE room_id = r.id
          AND status IN ('checked_in', 'confirmed', 'pending')
          ${reservationId ? "AND id <> $1::uuid" : ""}
        ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END, updated_at DESC
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
      WHERE COALESCE(r.is_active, true) = true
    `;
    const params: (string | undefined)[] = reservationId ? [reservationId] : [];

    if (status) {
      const statuses = status.split(",").map((value) => value.trim()).filter(Boolean);
      if (statuses.length > 0) {
        const placeholders = statuses.map((_, index) => `$${params.length + index + 1}`);
        sql += ` AND (${effectiveStatusExpr}) IN (${placeholders.join(", ")})`;
        params.push(...statuses);
      }
    }

    if (roomTypeId) {
      sql += ` AND r.room_type_id = $${params.length + 1}`;
      params.push(roomTypeId);
    }

    sql += ` ORDER BY r.floor ASC NULLS LAST, r.room_number ASC`;

    try {
      const result = await query(sql, params);
      return NextResponse.json(result.rows, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    } catch (primaryQueryError) {
      console.warn("Primary rooms query failed, using fallback query:", primaryQueryError);
      const fallbackResult = await query(
        `SELECT r.id, r.room_number, r.floor, r.building,
                COALESCE(r.status, 'available') AS status,
                r.room_type_id, r.notes,
                COALESCE(rt.name, 'Standard Room') AS room_type_name,
                rt.base_price,
                COALESCE(rt.base_price, 0) AS price
         FROM rooms r
         LEFT JOIN room_types rt ON r.room_type_id = rt.id
         WHERE COALESCE(r.is_active, true) = true
         ORDER BY r.floor ASC NULLS LAST, r.room_number ASC`,
      );
      return NextResponse.json(fallbackResult.rows, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }
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
