import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Get a specific reservation
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requirePermission("reservations");
    if (error) return error;

    const { id } = await context.params;

    const result = await query(
      `
      SELECT r.*, g.first_name, g.last_name, g.email, g.phone, rt.name as room_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching reservation:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservation" },
      { status: 500 }
    );
  }
}

// Update reservation
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requirePermission("reservations");
    if (error) return error;

    const { id } = await context.params;
    const { status, roomId, totalPrice, paidAmount, specialRequests } =
      await request.json();

    let sql = `UPDATE reservations SET updated_at = NOW()`;
    const values: (string | number | null)[] = [];

    if (status) {
      values.push(status);
      sql += `, status = $${values.length}`;
    }

    if (roomId) {
      values.push(roomId);
      sql += `, room_id = $${values.length}`;
    }

    if (totalPrice !== undefined) {
      values.push(totalPrice);
      sql += `, total_price = $${values.length}`;
    }

    if (paidAmount !== undefined) {
      values.push(paidAmount);
      sql += `, paid_amount = $${values.length}`;
    }

    if (specialRequests !== undefined) {
      values.push(specialRequests);
      sql += `, special_requests = $${values.length}`;
    }

    values.push(id);
    sql += ` WHERE id = $${values.length} RETURNING *`;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating reservation:", error);
    return NextResponse.json(
      { error: "Failed to update reservation" },
      { status: 500 }
    );
  }
}

// Cancel reservation
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requirePermission("reservations");
    if (error) return error;

    const { id } = await context.params;

    const result = await query(
      `
      UPDATE reservations SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Reservation cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling reservation:", error);
    return NextResponse.json(
      { error: "Failed to cancel reservation" },
      { status: 500 }
    );
  }
}
