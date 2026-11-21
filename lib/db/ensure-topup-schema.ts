import { query } from "@/lib/db";

let schemaEnsured = false;

export async function ensureTopUpReviewSchema(): Promise<void> {
  if (schemaEnsured) return;
  try {
    await query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
      ALTER TABLE inventory_top_up_audit ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending_review';
      ALTER TABLE inventory_top_up_audit ADD COLUMN IF NOT EXISTS reviewed_by UUID;
      ALTER TABLE inventory_top_up_audit ADD COLUMN IF NOT EXISTS reviewed_by_name VARCHAR(255);
      ALTER TABLE inventory_top_up_audit ADD COLUMN IF NOT EXISTS reviewed_by_role VARCHAR(50);
      ALTER TABLE inventory_top_up_audit ADD COLUMN IF NOT EXISTS review_notes TEXT;
      ALTER TABLE inventory_top_up_audit ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE inventory_top_up_audit ADD COLUMN IF NOT EXISTS evidence_pathname VARCHAR(512);
      DROP TRIGGER IF EXISTS inventory_top_up_audit_immutable ON inventory_top_up_audit;
    `);
    schemaEnsured = true;
  } catch (error) {
    console.error("Failed to ensure top up review schema:", error);
  }
}
