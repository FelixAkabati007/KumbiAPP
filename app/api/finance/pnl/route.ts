import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";

type Department = "hotel" | "restaurant" | "event" | "shared";

const departmentSql = `CASE
  WHEN LOWER(COALESCE(metadata->>'source', metadata->>'businessUnit', '')) IN ('event', 'events', 'event_organization') THEN 'event'
  WHEN LOWER(COALESCE(metadata->>'source', metadata->>'businessUnit', '')) IN ('restaurant', 'pos', 'food_beverage') THEN 'restaurant'
  WHEN LOWER(COALESCE(metadata->>'source', metadata->>'businessUnit', '')) = 'hotel' THEN 'hotel'
  WHEN transaction_id LIKE 'HOTEL-%' THEN 'hotel'
  ELSE 'restaurant'
END`;

export async function GET(request: Request) {
  const auth = await requireFinanceAccess();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const requestedDepartment = searchParams.get("department") as Department | null;
  const params: string[] = [];
  const filters: string[] = [];

  if (startDate) { filters.push(`occurred_at >= $${params.length + 1}`); params.push(startDate); }
  if (endDate) { filters.push(`occurred_at < ($${params.length + 1}::date + INTERVAL '1 day')`); params.push(endDate); }
  if (requestedDepartment && ["hotel", "restaurant", "event", "shared"].includes(requestedDepartment)) {
    filters.push(`department = $${params.length + 1}`); params.push(requestedDepartment);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const result = await query(
      `WITH financial_activity AS (
        SELECT ${departmentSql} AS department,
          created_at AS occurred_at,
          CASE WHEN LOWER(status) = 'refunded' THEN -ABS(amount::numeric) ELSE ABS(amount::numeric) END AS revenue,
          0::numeric AS expense
        FROM transaction_logs
        WHERE LOWER(status) IN ('completed','succeeded','success','paid','refunded')
        UNION ALL
        SELECT 'hotel' AS department, occurred_at, 0::numeric, 0::numeric
        FROM hotel_activity_ledger
        WHERE amount = 0
        UNION ALL
        SELECT CASE
          WHEN LOWER(COALESCE(department, '')) LIKE '%event%' THEN 'event'
          WHEN LOWER(COALESCE(department, '')) LIKE '%restaurant%' OR LOWER(COALESCE(department, '')) LIKE '%food%' THEN 'restaurant'
          WHEN LOWER(COALESCE(department, '')) LIKE '%hotel%' OR LOWER(COALESCE(department, '')) LIKE '%room%' THEN 'hotel'
          ELSE 'shared'
        END AS department,
          expense_date::timestamptz AS occurred_at,
          0::numeric AS revenue,
          CASE WHEN status IN ('approved','paid') THEN ABS(amount::numeric) ELSE 0 END AS expense
        FROM expenses
        WHERE status IN ('approved','paid')
        UNION ALL
        SELECT CASE
          WHEN LOWER(COALESCE(sp.department, '')) LIKE '%event%' THEN 'event'
          WHEN LOWER(COALESCE(sp.department, '')) LIKE '%restaurant%' OR LOWER(COALESCE(sp.department, '')) LIKE '%food%' OR LOWER(COALESCE(sp.department, '')) LIKE '%kitchen%' THEN 'restaurant'
          WHEN LOWER(COALESCE(sp.department, '')) LIKE '%hotel%' OR LOWER(COALESCE(sp.department, '')) LIKE '%front%' OR LOWER(COALESCE(sp.department, '')) LIKE '%housekeeping%' THEN 'hotel'
          ELSE 'shared'
        END AS department,
          pr.pay_period_end::timestamptz AS occurred_at,
          0::numeric AS revenue,
          CASE WHEN pr.status IN ('approved','paid','processed') THEN ABS(pr.gross_amount::numeric) ELSE 0 END AS expense
        FROM payroll_records pr
        LEFT JOIN staff_profiles sp ON sp.id = pr.staff_profile_id
      ), scoped AS (
        SELECT * FROM financial_activity ${where}
      ), grouped AS (
        SELECT department, COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(expense), 0) AS expense
        FROM scoped GROUP BY department
      )
      SELECT department, ROUND(revenue, 2) AS revenue, ROUND(expense, 2) AS expense,
        ROUND(revenue - expense, 2) AS profit,
        CASE WHEN revenue = 0 THEN 0 ELSE ROUND(((revenue - expense) / revenue) * 100, 2) END AS margin
      FROM grouped ORDER BY CASE department WHEN 'hotel' THEN 1 WHEN 'restaurant' THEN 2 WHEN 'event' THEN 3 ELSE 4 END`,
      params,
    );

    const rows = result.rows.map((row) => ({
      department: row.department as Department,
      revenue: Number(row.revenue || 0),
      expense: Number(row.expense || 0),
      profit: Number(row.profit || 0),
      margin: Number(row.margin || 0),
    }));
    const departments: Department[] = ["hotel", "restaurant", "event", "shared"];
    const byDepartment = departments.map((department) => rows.find((row) => row.department === department) ?? { department, revenue: 0, expense: 0, profit: 0, margin: 0 });
    const totals = byDepartment.reduce((summary, row) => ({ revenue: summary.revenue + row.revenue, expense: summary.expense + row.expense, profit: summary.profit + row.profit }), { revenue: 0, expense: 0, profit: 0 });
    return NextResponse.json({ departments: byDepartment, totals: { ...totals, margin: totals.revenue ? Number(((totals.profit / totals.revenue) * 100).toFixed(2)) : 0 }, actingAuthority: Boolean(auth.actingAuthority) });
  } catch (error) {
    console.error("Failed to build finance P&L:", error);
    return NextResponse.json({ error: "Failed to build finance report" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
