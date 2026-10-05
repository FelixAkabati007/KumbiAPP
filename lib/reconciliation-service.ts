import { query } from "@/lib/db";

export async function reconcileOperationalTotals() {
  const result = await query(
    `WITH order_totals AS (
       SELECT id::text aggregate_id, total_amount expected_amount
       FROM orders
       WHERE status::text NOT IN ('cancelled', 'voided')
     ), journal_totals AS (
       SELECT entity_id aggregate_id,
         COALESCE(SUM(amount) FILTER (WHERE direction = 'credit' AND journal_type NOT IN ('refund','reversal')), 0) AS observed_amount,
         COALESCE(SUM(amount) FILTER (WHERE direction = 'debit' AND journal_type IN ('refund','reversal')), 0) AS refunded_amount
       FROM canonical_financial_ledger
       WHERE entity_type = 'order' AND LOWER(status) IN ('posted','completed','paid','succeeded','refunded','reversed')
       GROUP BY entity_id
     )
     INSERT INTO operational_reconciliation (aggregate_type, aggregate_id, source_table, source_id, expected_amount, observed_amount, status, details)
     SELECT 'order', o.aggregate_id, 'canonical_financial_ledger', o.aggregate_id,
       o.expected_amount, COALESCE(j.observed_amount, 0) - COALESCE(j.refunded_amount, 0),
       CASE
         WHEN COALESCE(j.observed_amount, 0) - COALESCE(j.refunded_amount, 0) = o.expected_amount THEN 'balanced'
         WHEN COALESCE(j.observed_amount, 0) - COALESCE(j.refunded_amount, 0) < o.expected_amount THEN 'underpaid'
         ELSE 'overpaid'
       END,
       jsonb_build_object('checkedBy', 'reconciliation_service', 'sourceOfTruth', 'canonical_financial_ledger', 'refundedAmount', COALESCE(j.refunded_amount, 0))
     FROM order_totals o LEFT JOIN journal_totals j ON j.aggregate_id = o.aggregate_id
     ON CONFLICT (aggregate_type, aggregate_id, source_table, source_id)
     DO UPDATE SET expected_amount = EXCLUDED.expected_amount, observed_amount = EXCLUDED.observed_amount,
       status = EXCLUDED.status, details = EXCLUDED.details, checked_at = now()
     RETURNING aggregate_id, expected_amount, observed_amount, status`,
  );
  return result.rows;
}
