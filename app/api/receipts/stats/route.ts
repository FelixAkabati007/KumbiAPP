import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission, type UserRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.role as UserRole;
    const isAllowed =
      ["admin", "manager", "staff", "frontDesk"].includes(role) ||
      hasPermission(role, "receipt") ||
      hasPermission(role, "pos") ||
      hasPermission(role, "finance") ||
      hasPermission(role, "guestFolio");

    if (!isAllowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check which receipt-bearing tables exist so stats count hotel/event receipts,
    // restaurant POS orders (kitchenorders), and canonical receipts without double-counting
    // the same order/receipt reference.
    const tablesRes = await query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('hotel_receipts', 'kitchenorders', 'canonical_receipts')`,
    );
    const present = new Set(tablesRes.rows.map((r) => String(r.table_name)));

    const unionBranches: string[] = [];
    if (present.has("hotel_receipts")) {
      unionBranches.push(`
        SELECT
          UPPER(TRIM(COALESCE(NULLIF(hr.order_number, ''), hr.id::text))) AS ref_key,
          hr.created_at AS created_at
        FROM hotel_receipts hr
        WHERE LOWER(COALESCE(hr.receipt_type, '')) NOT IN ('refund', 'refunded', 'reversal', 'reversed', 'void')
      `);
    }
    if (present.has("kitchenorders")) {
      unionBranches.push(`
        SELECT
          UPPER(TRIM(k.ordernumber)) AS ref_key,
          COALESCE(
            NULLIF(to_jsonb(k)->>'created_at', '')::timestamptz,
            NULLIF(to_jsonb(k)->>'createdat', '')::timestamptz,
            CURRENT_TIMESTAMP
          ) AS created_at
        FROM kitchenorders k
        WHERE LOWER(COALESCE(k.status, '')) NOT IN ('cancelled', 'void', 'refunded')
          AND k.ordernumber IS NOT NULL
      `);
    }
    if (present.has("canonical_receipts")) {
      unionBranches.push(`
        SELECT
          UPPER(TRIM(cr.receipt_number)) AS ref_key,
          cr.created_at AS created_at
        FROM canonical_receipts cr
        WHERE cr.receipt_number IS NOT NULL
      `);
    }

    if (unionBranches.length === 0) {
      return NextResponse.json({ today: 0, week: 0, month: 0, total: 0 });
    }

    const sql = `
      WITH unified_receipts AS (
        ${unionBranches.join("\nUNION ALL\n")}
      ),
      deduped AS (
        SELECT ref_key, MIN(created_at) AS created_at
        FROM unified_receipts
        WHERE ref_key IS NOT NULL AND ref_key <> ''
        GROUP BY ref_key
      )
      SELECT
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Africa/Accra') >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra'))::int AS today,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Africa/Accra') >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra'))::int AS week,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Africa/Accra') >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra'))::int AS month,
        COUNT(*)::int AS total
      FROM deduped
    `;

    const result = await query(sql);
    const row = result.rows[0] || {};

    const stats = {
      today: Number(row.today ?? 0),
      week: Number(row.week ?? 0),
      month: Number(row.month ?? 0),
      total: Number(row.total ?? 0),
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
