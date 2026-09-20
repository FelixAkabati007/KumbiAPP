import { query } from "@/lib/db";

export async function reconcileOperationalTotals() {
  const result = await query(
    `WITH order_totals AS (
       SELECT id::text AS aggregate_id, total_amount AS expected_amount
       FROM orders
       WHERE status::text NOT IN ('cancelled', 'voided')
     ), payments AS (
       SELECT order_id::text AS aggregate_id, COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS observed_amount
       FROM transactions
       WHERE order_id IS NOT NULL
       GROUP BY order_id
     )
     INSERT INTO operational_reconciliation (aggregate_type, aggregate_id, source_table, source_id, expected_amount, observed_amount, status, details)
     SELECT 'order', o.aggregate_id, 'transactions', o.aggregate_id, o.expected_amount, p.observed_amount,
       CASE WHEN p.observed_amount <= o.expected_amount THEN 'balanced' ELSE 'overpaid' END,
       jsonb_build_object('checkedBy', 'reconciliation_service')
     FROM order_totals o
     LEFT JOIN payments p ON p.aggregate_id = o.aggregate_id
     ON CONFLICT (aggregate_type, aggregate_id, source_table, source_id)
     DO UPDATE SET expected_amount = EXCLUDED.expected_amount, observed_amount = EXCLUDED.observed_amount,
       status = EXCLUDED.status, details = EXCLUDED.details, checked_at = now()
     RETURNING aggregate_id, expected_amount, observed_amount, status`,
  );
  return result.rows;
}
