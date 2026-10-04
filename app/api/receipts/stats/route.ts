import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Receipt statistics are operationally useful to front desk as well as management.
    const allowedRoles = ["admin", "manager", "staff", "frontDesk"];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // hotel_receipts is the canonical receipt record. Financial ledger entries
    // remain the source for monetary reporting, but must not be counted as
    // additional receipts because event bookings write to both tables.
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::int AS week,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS month,
        COUNT(*)::int AS total
      FROM hotel_receipts
      WHERE LOWER(COALESCE(receipt_type, '')) NOT IN ('refund', 'refunded', 'reversal', 'reversed', 'void')
    `;

    const result = await query(sql);
    const row = result.rows[0];

    const stats = {
      today: Number(row.today),
      week: Number(row.week),
      month: Number(row.month),
      total: Number(row.total),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Failed to fetch receipt stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipt stats" },
      { status: 500 }
    );
  }
}
