import { describe, expect, it } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();
neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("authenticated event finance workflow", () => {
  it("keeps posted event balances equal to the canonical ledger", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await pool.query(`
        SELECT e.id,
               e.total_invoiced,
               e.total_paid,
               e.balance_due,
               COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount ELSE -l.amount END)
                 FILTER (WHERE l.status = 'posted' AND l.entity_type = 'event' AND l.entity_id = e.id::text AND l.source IN ('event_payment', 'event_refund', 'event_payment_reversal')), 0) AS ledger_balance
        FROM events e
        LEFT JOIN canonical_financial_ledger l ON l.entity_type = 'event' AND l.entity_id = e.id::text
        WHERE e.deleted_at IS NULL
        GROUP BY e.id, e.total_invoiced, e.total_paid, e.balance_due
      `);

      for (const row of result.rows) {
        const ledgerBalance = Number(row.ledger_balance);
        expect(Number(row.total_paid)).toBeCloseTo(
          Math.max(ledgerBalance, 0),
          2,
        );
        expect(Number(row.balance_due)).toBeCloseTo(
          Math.max(Number(row.total_invoiced) - ledgerBalance, 0),
          2,
        );
      }
    } finally {
      await pool.end();
    }
  }, 30000);

  it("has no completed event payment that is absent from the posted journal", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM event_payments p
        WHERE p.status IN ('completed', 'succeeded', 'success', 'paid')
          AND NOT EXISTS (
            SELECT 1 FROM canonical_financial_ledger l
            WHERE l.entity_type = 'event'
              AND l.entity_id = p.event_id::text
              AND l.status = 'posted'
              AND l.metadata->>'paymentId' = p.id::text
          )
      `);
      expect(Number(result.rows[0].count)).toBe(0);
    } finally {
      await pool.end();
    }
  }, 30000);
});
