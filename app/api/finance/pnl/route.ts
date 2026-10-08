import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";
import { financeDepartmentSql } from "@/lib/finance-classification";

type Department = "hotel" | "restaurant" | "event" | "shared_event" | "shared";

const departmentSql = financeDepartmentSql;

export async function GET(request: Request) {
  const auth = await requireFinanceAccess();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const requestedDepartment = searchParams.get("department") as Department | null;
  const params: string[] = [];
  const filters: string[] = ["LOWER(status) IN ('posted','completed','paid','succeeded','refunded','reversed','cancelled')"];
  if (startDate) { filters.push(`occurred_at >= $${params.length + 1}`); params.push(startDate); }
  if (endDate) { filters.push(`occurred_at < ($${params.length + 1}::date + INTERVAL '1 day')`); params.push(endDate); }
  if (requestedDepartment && ["hotel", "restaurant", "event", "shared_event", "shared"].includes(requestedDepartment)) { filters.push(`${departmentSql} = $${params.length + 1}`); params.push(requestedDepartment); }
  try {
    await query(`UPDATE canonical_financial_ledger
      SET metadata = CASE
        WHEN LOWER(COALESCE(source, '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'f0-%' THEN metadata || '{"department":"Shared","businessUnit":"Corporate","classificationRule":"f0-corporate","classificationResolvedAt":"now"}'::jsonb
        WHEN LOWER(COALESCE(source, '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'vip-authorization%' THEN metadata || '{"department":"Shared Event","businessUnit":"Shared Event","classificationRule":"vip-authorization-shared-event","classificationResolvedAt":"now"}'::jsonb
        WHEN LOWER(COALESCE(source, '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'event-payment:%' THEN metadata || '{"department":"Event Organization","businessUnit":"Event Organization","classificationRule":"event-payment-event-organization","classificationResolvedAt":"now"}'::jsonb
        ELSE metadata
      END
      WHERE LOWER(COALESCE(metadata->>'source', source, '')) LIKE 'f0-%'
         OR LOWER(COALESCE(metadata->>'source', source, '')) LIKE 'vip-authorization%'
         OR LOWER(COALESCE(metadata->>'source', source, '')) LIKE 'event-payment:%'`, []);
    await query(`
      INSERT INTO canonical_financial_ledger
        (event_key, amount, currency, direction, status, source, payment_method, entity_type, entity_id, journal_type, metadata, occurred_at)
      SELECT t.transaction_reference, ABS(t.amount), COALESCE(t.currency, 'GHS'), 'credit',
        CASE WHEN LOWER(t.status) IN ('completed','paid','success','succeeded') THEN 'posted' ELSE LOWER(t.status) END,
        CASE
          WHEN LOWER(COALESCE(t.metadata->>'department', t.metadata->>'businessUnit', t.metadata->>'source', '')) IN ('hotel','room','accommodation') THEN 'hotel-payment'
          WHEN LOWER(COALESCE(t.metadata->>'department', t.metadata->>'businessUnit', t.metadata->>'source', '')) IN ('restaurant','pos','food_beverage','food_and_beverage','pos-order-completion') THEN 'pos-order-completion'
          WHEN LOWER(COALESCE(t.metadata->>'source', '')) LIKE 'event-payment:%' THEN 'event-payment'
          ELSE COALESCE(t.metadata->>'source', 'legacy-transaction')
        END,
        t.method, 'legacy_transaction', t.id,
        'operational',
        jsonb_set(COALESCE(t.metadata, '{}'::jsonb), '{performedBy,accountName}', to_jsonb(COALESCE(u.name, u.email, t.performed_by::text)), true),
        COALESCE(t.created_at, now())
      FROM transactions t
      LEFT JOIN users u ON u.id = t.performed_by
      WHERE COALESCE(t.amount, 0) <> 0
        AND LOWER(t.status) IN ('completed','paid','success','succeeded','posted')
        AND NOT EXISTS (SELECT 1 FROM canonical_financial_ledger l WHERE l.event_key = t.transaction_reference)
      ON CONFLICT (event_key) DO NOTHING`, []);
    const result = await query(
      `WITH posted AS (
        SELECT ${departmentSql} AS department,
          CASE WHEN direction = 'credit' AND journal_type NOT IN ('refund','reversal','adjustment') THEN amount ELSE 0::numeric END AS gross_revenue,
          CASE WHEN direction = 'debit' AND journal_type IN ('refund','reversal','adjustment') THEN amount ELSE 0::numeric END AS refund_amount,
          CASE WHEN direction = 'credit' AND journal_type NOT IN ('refund','reversal','adjustment') THEN amount ELSE 0::numeric END
            - CASE WHEN direction = 'debit' AND journal_type IN ('refund','reversal','adjustment') THEN amount ELSE 0::numeric END AS revenue,
          CASE WHEN direction = 'debit' AND journal_type IN ('expense','payroll') THEN amount ELSE 0::numeric END AS expense
        FROM canonical_financial_ledger
        WHERE ${filters.join(" AND ")}
      ), grouped AS (
        SELECT department, SUM(revenue) revenue, SUM(refund_amount) refund_amount, SUM(gross_revenue) gross_revenue, SUM(expense) expense
        FROM posted GROUP BY department
      )
      SELECT department, ROUND(revenue, 2) revenue, ROUND(refund_amount, 2) refund_amount, ROUND(gross_revenue, 2) gross_revenue, ROUND(expense, 2) expense,
        ROUND(revenue - expense, 2) profit,
        CASE WHEN revenue = 0 THEN 0 ELSE ROUND(((revenue - expense) / revenue) * 100, 2) END margin
      FROM grouped
      ORDER BY CASE department WHEN 'hotel' THEN 1 WHEN 'restaurant' THEN 2 WHEN 'event' THEN 3 WHEN 'shared_event' THEN 4 ELSE 5 END`,
      params,
    );
    const departments: Department[] = ["hotel", "restaurant", "event", "shared_event", "shared"];
    const rows = result.rows.map((row) => ({ department: row.department as Department, revenue: Number(row.revenue || 0), refundAmount: Number(row.refund_amount || 0), grossRevenue: Number(row.gross_revenue || 0), expense: Number(row.expense || 0), profit: Number(row.profit || 0), margin: Number(row.margin || 0) }));
    const byDepartment = departments.map((department) => rows.find((row) => row.department === department) ?? { department, revenue: 0, refundAmount: 0, grossRevenue: 0, expense: 0, profit: 0, margin: 0 });
    const totals = byDepartment.reduce((summary, row) => ({ revenue: summary.revenue + row.revenue, refundAmount: summary.refundAmount + row.refundAmount, grossRevenue: summary.grossRevenue + row.grossRevenue, expense: summary.expense + row.expense, profit: summary.profit + row.profit }), { revenue: 0, refundAmount: 0, grossRevenue: 0, expense: 0, profit: 0 });
    const exceptionResult = await query(`SELECT event_key, amount, status, occurred_at, source, metadata FROM canonical_financial_ledger WHERE LOWER(status) IN ('posted','completed','paid','succeeded') AND COALESCE(metadata->>'classificationResolvedAt', '') = '' AND source <> 'event_booking' AND (${departmentSql}) = 'shared' ORDER BY occurred_at DESC LIMIT 25`);
    const complimentaryResult = await query(`SELECT COALESCE(SUM(amount_used), 0) waived_amount, COUNT(*)::int usage_count FROM complimentary_authorization_usage WHERE ($1::date IS NULL OR applied_at >= $1::date) AND ($2::date IS NULL OR applied_at < ($2::date + INTERVAL '1 day'))`, [startDate, endDate]);
    return NextResponse.json({ departments: byDepartment, totals: { ...totals, margin: totals.revenue ? Number(((totals.profit / totals.revenue) * 100).toFixed(2)) : 0 }, complimentary: { waivedAmount: Number(complimentaryResult.rows[0]?.waived_amount || 0), usageCount: Number(complimentaryResult.rows[0]?.usage_count || 0) }, accountingBasis: { revenue: "Canonical posted credit journal entries", refunds: "Linked canonical debit reversals", expenses: "Canonical approved expense/payroll debit entries" }, exceptions: exceptionResult.rows.map((row) => { const metadata = row.metadata ?? {}; const performedBy = metadata.performedBy ?? metadata.initiatedBy ?? null; const approvedBy = metadata.approvedBy ?? null; return { transactionId: row.event_key, amount: Number(row.amount || 0), status: row.status, createdAt: row.occurred_at, source: row.source, initiatedBy: performedBy, approvedBy }; }), actingAuthority: Boolean(auth.actingAuthority) });
  } catch (error) {
    console.error("Failed to build finance P&L:", error);
    return NextResponse.json({ error: "Failed to build finance report" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
