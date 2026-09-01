import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Get all currently checked-in reservations joined with room and folio balance,
// used to power the Check-Out list on the Check-In/Out page.
export async function GET() {
  try {
    const { error } = await requirePermission("checkIn");
    if (error) return error;

    const sql = `
      SELECT
        r.id,
        r.reservation_number,
        r.room_id,
        r.check_in_date,
        r.check_out_date,
        g.first_name,
        g.last_name,
        rm.room_number,
        rt.name as room_type_name,
        gf.total_charges,
        gf.paid_amount,
        gf.balance
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN guest_folios gf ON gf.reservation_id = r.id
      WHERE r.status = 'checked_in'
      ORDER BY r.check_in_date ASC
      LIMIT 500
    `;

    const result = await query(sql);
    const response = NextResponse.json(result.rows);
    // This list changes immediately after check-out; never serve a stale
    // cached guest after the mutation succeeds.
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    console.error("Error fetching checked-in guests:", error);
    return NextResponse.json(
      { error: "Failed to fetch checked-in guests" },
      { status: 500 }
    );
  }
}
