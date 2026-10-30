import { query } from "@/lib/db";

let tableEnsured = false;

export async function ensureInventoryVariancesTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS inventory_variances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        reported_by UUID NOT NULL REFERENCES users(id),
        reported_by_name VARCHAR(255),
        reported_by_role VARCHAR(50),
        reason VARCHAR(100) NOT NULL,
        quantity DECIMAL(12, 4) NOT NULL,
        explanation TEXT NOT NULL,
        evidence_pathname VARCHAR(512),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        reviewed_by UUID REFERENCES users(id),
        reviewed_by_name VARCHAR(255),
        reviewed_by_role VARCHAR(50),
        reviewer_notes TEXT,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_variances_status ON inventory_variances(status);
      CREATE INDEX IF NOT EXISTS idx_inventory_variances_item ON inventory_variances(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_variances_created ON inventory_variances(created_at DESC);
    `);
    tableEnsured = true;
  } catch (error) {
    console.error("Failed to ensure inventory_variances table:", error);
  }
}
