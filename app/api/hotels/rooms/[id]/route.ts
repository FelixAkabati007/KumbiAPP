import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Get a specific room
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requirePermission("rooms");
    if (error) return error;

    const { id } = await context.params;

    const result = await query(
      `
      SELECT r.id, r.room_number, r.floor, r.building, r.status, r.notes,
             rt.name as room_type_name, rt.base_price,
             COALESCE(r.price, rt.base_price) as price,
             r.images, r.created_at, r.updated_at
      FROM rooms r
      JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.id = $1 AND r.is_active = true
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching room:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}

// Update room status or details
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requirePermission("rooms");
    if (error) return error;

    const { id } = await context.params;
    const { status, notes, currentGuestId } = await request.json();

    let sql = `UPDATE rooms SET updated_at = NOW()`;
    const values: (string | null)[] = [];

    if (status) {
      values.push(status);
      sql += `, status = $${values.length}`;
    }

    if (notes !== undefined) {
      values.push(notes);
      sql += `, notes = $${values.length}`;
    }

    if (currentGuestId !== undefined) {
      values.push(currentGuestId);
      sql += `, current_guest_id = $${values.length}`;
    }

    values.push(id);
    sql += ` WHERE id = $${values.length} RETURNING *`;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = result.rows[0];
    await query(
      `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, room_id, amount, description, metadata)
       VALUES ($1, 'room', $2, $2, 0, $3, $4)`,
      [status ? `room_status_${status}` : "room_updated", String(room.id), `Room ${room.room_number} updated${status ? ` to ${status}` : ""}`, JSON.stringify({ source: "hotel", status, currentGuestId })]
    );
    return NextResponse.json(room);
  } catch (error) {
    console.error("Error updating room:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}

// Delete room (soft delete by setting is_active to false)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requirePermission("rooms");
    if (error) return error;

    const { id } = await context.params;

    const result = await query(
      `
      UPDATE rooms SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("Error deleting room:", error);
    return NextResponse.json(
      { error: "Failed to delete room" },
      { status: 500 }
    );
  }
}
