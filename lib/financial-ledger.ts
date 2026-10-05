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
  originalEntryId?: string | null;
  journalType?: "operational" | "refund" | "reversal" | "adjustment" | "expense" | "payroll";
  sourceEventId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | Date;
};

/**
 * The canonical journal is append-only. Replays are idempotent by eventKey;
 * corrections must be represented by a linked reversal or adjustment entry.
 */
export async function recordFinancialLedgerEntry(client: DatabaseClient, entry: FinancialLedgerEntry) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO canonical_financial_ledger
      (event_key, amount, currency, direction, status, source, payment_method, entity_type, entity_id, original_entry_id, journal_type, source_event_id, metadata, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,COALESCE($14::timestamptz, now()))
     ON CONFLICT (event_key) DO NOTHING
     RETURNING id`,
    [
      entry.eventKey,
      Math.abs(entry.amount),
      entry.currency ?? "GHS",
      entry.direction,
      entry.status,
      entry.source,
      entry.paymentMethod ?? null,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.originalEntryId ?? null,
      entry.journalType ?? "operational",
      entry.sourceEventId ?? entry.eventKey,
      JSON.stringify(entry.metadata ?? {}),
      entry.occurredAt ?? null,
    ],
  );

  return result.rows[0]?.id ?? null;
}
