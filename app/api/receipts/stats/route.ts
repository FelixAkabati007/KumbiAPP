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

    // Role check: Admin, Manager, Staff, Kitchen should be able to see receipt stats
    // Middleware already allows staff, but let's be safe.
    const allowedRoles = ["admin", "manager", "staff", "kitchen"];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch stats
    // We count orders that are 'paid' or 'completed' to be safe, usually 'paid' implies a receipt.
    // Assuming 'payment_status' = 'paid' is the key.

    const sql = `
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) as week,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as month,
          COUNT(*) as total
        FROM transaction_logs
        WHERE status = 'success'
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
