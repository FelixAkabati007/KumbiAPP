import { query } from "@/lib/db";

let tableEnsured = false;

export async function ensureInventoryVariancesTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS inventory_variances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_item_id UUID NOT NULL,
        reported_by UUID,
        reported_by_name VARCHAR(255),
        reported_by_role VARCHAR(50),
        reason VARCHAR(100) NOT NULL,
        quantity DECIMAL(12, 4) NOT NULL,
        explanation TEXT NOT NULL,
        evidence_pathname VARCHAR(512),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        reviewed_by UUID,
        reviewed_by_name VARCHAR(255),
        reviewed_by_role VARCHAR(50),
        reviewer_notes TEXT,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS evidence_pathname VARCHAR(512);
      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending';
      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS reviewed_by UUID;
      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS reviewed_by_name VARCHAR(255);
      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS reviewed_by_role VARCHAR(50);
      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS reviewer_notes TEXT;
      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE inventory_variances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE inventory_variances DROP CONSTRAINT IF EXISTS inventory_variances_reviewed_by_fkey;
      ALTER TABLE inventory_variances DROP CONSTRAINT IF EXISTS inventory_variances_reported_by_fkey;

      CREATE INDEX IF NOT EXISTS idx_inventory_variances_status ON inventory_variances(status);
      CREATE INDEX IF NOT EXISTS idx_inventory_variances_item ON inventory_variances(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_variances_created ON inventory_variances(created_at DESC);

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID NOT NULL,
        menu_item_id UUID,
        quantity_delta DECIMAL(12, 4) NOT NULL,
        movement_type VARCHAR(50) NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_id VARCHAR(255),
        order_id VARCHAR(255),
        reason TEXT,
        actor_id UUID,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_id ON inventory_movements(inventory_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at);

      CREATE TABLE IF NOT EXISTS inventory_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        quantity_before DECIMAL(12, 4) NOT NULL,
        quantity_delta DECIMAL(12, 4) NOT NULL,
        quantity_after DECIMAL(12, 4) NOT NULL,
        purchase_packaging_price_before DECIMAL(12, 2),
        purchase_packaging_price_after DECIMAL(12, 2),
        cost_per_item_before DECIMAL(12, 4),
        cost_per_item_after DECIMAL(12, 4),
        reason TEXT,
        staff_id UUID,
        staff_name VARCHAR(255),
        staff_role VARCHAR(50),
        correlation_id VARCHAR(255),
        idempotency_key VARCHAR(255),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_events_inventory_id ON inventory_events(inventory_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_events_created_at ON inventory_events(created_at);
    `);
    tableEnsured = true;
  } catch (error) {
    console.error("Failed to ensure inventory_variances table:", error);
  }
}
