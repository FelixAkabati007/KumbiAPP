import { transaction, type DatabaseClient } from "@/lib/db";
import { financeClassificationMetadata } from "@/lib/finance-classification";

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
  journalType?:
    | "operational"
    | "refund"
    | "reversal"
    | "adjustment"
    | "expense"
    | "payroll";
  sourceEventId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | Date;
};

/**
 * The canonical journal is append-only. Replays are idempotent by eventKey;
 * corrections must be represented by a linked reversal or adjustment entry.
 */
export async function recordFinancialLedgerEntry(
  client: DatabaseClient,
  entry: FinancialLedgerEntry,
) {
  const status = entry.status === "completed" || entry.status === "paid" || entry.status === "success" || entry.status === "succeeded"
    ? "posted"
    : entry.status;
  const metadata = { ...(entry.metadata ?? {}) };
  const classificationSource = [entry.source, metadata.source, metadata.department, metadata.businessUnit]
    .find((value): value is string => typeof value === "string" && /^(f0-|fo-|vip-authorization|event-payment:)/i.test(value))
    ?? entry.source;
  const sourceClassification = financeClassificationMetadata(classificationSource, typeof metadata.department === "string" ? metadata.department : null);
  if (sourceClassification.classificationRule) {
    Object.assign(metadata, sourceClassification);
  }
  for (const key of ["performedBy", "approvedBy"]) {
    const value = metadata[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const actor = value as Record<string, unknown>;
      if (!actor.accountName) actor.accountName = actor.name ?? actor.email ?? actor.id ?? null;
    }
  }
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
      status,
      entry.source,
      entry.paymentMethod ?? null,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.originalEntryId ?? null,
      entry.journalType ?? "operational",
      entry.sourceEventId ?? entry.eventKey,
      JSON.stringify(metadata),
      entry.occurredAt ?? null,
    ],
  );

  return result.rows[0]?.id ?? null;
}

export async function recordPaymentLedgerEntry(
  entry: Omit<FinancialLedgerEntry, "direction" | "status" | "journalType"> & {
    source: "pos" | "hotel_check_in" | "hotel_folio" | "event";
    paymentMethod: NonNullable<FinancialLedgerEntry["paymentMethod"]>;
    status?: string;
  },
) {
  return transaction((client) => recordFinancialLedgerEntry(client, {
    ...entry,
    direction: "credit",
    status: entry.status ?? "posted",
    journalType: "operational",
  }));
}

export async function getPostedEntityBalance(
  client: DatabaseClient,
  entityType: string,
  entityId: string,
) {
  const result = await client.query<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::numeric AS balance
     FROM canonical_financial_ledger
     WHERE entity_type = $1 AND entity_id = $2 AND status = 'posted'`,
    [entityType, entityId],
  );
  return Number(result.rows[0]?.balance ?? 0);
}

export async function getPostedEntityCredits(
  client: DatabaseClient,
  entityType: string,
  entityId: string,
) {
  const result = await client.query<{ credits: string }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS credits
     FROM canonical_financial_ledger
     WHERE entity_type = $1 AND entity_id = $2 AND direction = 'credit' AND status = 'posted'
       AND source = 'event_payment'`,
    [entityType, entityId],
  );
  return Number(result.rows[0]?.credits ?? 0);
}
