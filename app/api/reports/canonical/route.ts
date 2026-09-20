import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requirePermission("reports");
  if (error) return error;

  try {
    const result = await query(
      `SELECT
         CURRENT_DATE AS report_date,
         COUNT(*)::int AS order_count,
         COALESCE(SUM(total_amount), 0)::numeric AS gross_sales,
         COALESCE(SUM(tax_amount), 0)::numeric AS tax_sales,
         COUNT(*) FILTER (WHERE payment_status::text = 'paid')::int AS paid_order_count
       FROM orders
       WHERE created_at::date = CURRENT_DATE
         AND status::text NOT IN ('cancelled', 'voided')`,
    );
    return NextResponse.json({ report: result.rows[0], source: "orders", generatedFor: session.role });
  } catch (cause) {
    console.error("[reports] canonical projection failed", cause);
    return NextResponse.json({ error: "Unable to load canonical report" }, { status: 500 });
  }
}
