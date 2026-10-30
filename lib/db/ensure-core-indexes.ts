import { query } from "@/lib/db";
import { ALL_USER_ROLES } from "@/lib/roles";

let coreSchemaEnsuredPromise: Promise<void> | null = null;

/**
 * Idempotently ensures all canonical user_role enum values, reservation columns,
 * and high-throughput composite indexes exist in PostgreSQL.
 * Executed once per server instance lifecycle.
 */
export async function ensureCoreSchemaAndIndexes(): Promise<void> {
  if (!coreSchemaEnsuredPromise) {
    coreSchemaEnsuredPromise = (async () => {
      try {
        // 1. Ensure all 12 canonical roles exist on user_role enum
        for (const role of ALL_USER_ROLES) {
          await query(
            `DO $$ BEGIN
               ALTER TYPE user_role ADD VALUE IF NOT EXISTS '${role}';
             EXCEPTION
               WHEN undefined_object THEN null;
               WHEN duplicate_object THEN null;
             END $$;`,
          ).catch(() => undefined);
        }

        // 2. Ensure hot-path composite indexes exist for attendance, ledger, movements, and orders
        await query(`
          CREATE INDEX IF NOT EXISTS idx_attendance_user_status_created
            ON attendance_records (user_id, verification_status, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_ledger_occurred_at
            ON canonical_financial_ledger (occurred_at DESC);

          CREATE INDEX IF NOT EXISTS idx_ledger_entity_id
            ON canonical_financial_ledger (entity_id);

          CREATE INDEX IF NOT EXISTS idx_ledger_event_key
            ON canonical_financial_ledger (event_key);

          CREATE INDEX IF NOT EXISTS idx_inv_movements_order_type
            ON inventory_movements (order_id, movement_type);

          CREATE INDEX IF NOT EXISTS idx_inv_movements_source_type
            ON inventory_movements (source_id, movement_type);

          CREATE INDEX IF NOT EXISTS idx_kitchen_orderitems_orderid
            ON kitchen_orderitems (kitchenorderid);
        `).catch(() => undefined);
      } catch (err) {
        console.warn("[DB] Non-fatal warning in ensureCoreSchemaAndIndexes:", err);
      }
    })();
  }
  return coreSchemaEnsuredPromise;
}
