import type { DatabaseClient } from "@/lib/db";

export type FinancialLedgerEntry = {
  eventKey: string;
  amount: number;
  currency?: string;
  direction: "credit" | "debit";
  status: string;
  source: string;
  paymentMethod?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | Date;
};

export async function recordFinancialLedgerEntry(client: DatabaseClient, entry: FinancialLedgerEntry) {
  await client.query(
    `INSERT INTO canonical_financial_ledger
      (event_key, amount, currency, direction, status, source, payment_method, entity_type, entity_id, metadata, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,COALESCE($11::timestamptz, now()))
     ON CONFLICT (event_key) DO UPDATE SET
       amount = EXCLUDED.amount,
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       occurred_at = EXCLUDED.occurred_at`,
    [entry.eventKey, entry.amount, entry.currency ?? "GHS", entry.direction, entry.status, entry.source, entry.paymentMethod ?? null, entry.entityType ?? null, entry.entityId ?? null, JSON.stringify(entry.metadata ?? {}), entry.occurredAt ?? null],
  );
}
