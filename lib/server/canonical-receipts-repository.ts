import { query } from "@/lib/db";
import { canonicalReceiptKey, type CanonicalPrintMethod, type ReceiptSource } from "@/lib/canonical-receipts";

export type PersistCanonicalReceiptInput = {
  source: ReceiptSource;
  entityId: string;
  receiptNumber: string;
  version: number;
  printMethod: CanonicalPrintMethod;
  payload: unknown;
  requestedBy?: string | null;
};

export async function upsertCanonicalReceipt(input: PersistCanonicalReceiptInput) {
  const identityKey = canonicalReceiptKey(input);
  const receipt = await query<{ id: string }>(
    `INSERT INTO canonical_receipts (identity_key, source, entity_id, receipt_number, version, print_method, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (identity_key) DO UPDATE SET print_method = EXCLUDED.print_method, payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING id`,
    [identityKey, input.source, input.entityId.trim(), input.receiptNumber.trim().toUpperCase(), input.version, input.printMethod, JSON.stringify(input.payload)],
  );
  const receiptId = receipt.rows[0]?.id;
  if (!receiptId) throw new Error("CANONICAL_RECEIPT_NOT_PERSISTED");
  const idempotencyKey = `${identityKey}:${input.printMethod}`;
  const attempt = await query<{ id: string; status: string }>(
    `INSERT INTO canonical_receipt_print_attempts (receipt_id, idempotency_key, print_method, status, requested_by)
     VALUES ($1, $2, $3, 'queued', $4)
     ON CONFLICT (idempotency_key) DO UPDATE SET receipt_id = EXCLUDED.receipt_id
     RETURNING id, status`,
    [receiptId, idempotencyKey, input.printMethod, input.requestedBy ?? null],
  );
  return { receiptId, identityKey, idempotencyKey, status: attempt.rows[0]?.status ?? "queued" };
}
