import { query } from "@/lib/db";
import { getInventoryUnitSqlExpression, getRecipeDeductionQuantity } from "@/lib/inventory-units";

const inventoryUnitSql = `COALESCE(${getInventoryUnitSqlExpression("i.container_unit")}, ${getInventoryUnitSqlExpression("i.unit")})`;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_PAYMENT_METHODS = new Set([
  "cash",
  "card",
  "mobile",
  "mobile_money",
  "bank_transfer",
  "room_charge",
  "complimentary",
  "other",
  "guest-folio",
  "paid-at-order",
]);

export function toSafeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

export function normalizePosPaymentMethod(method: unknown): string {
  const raw = String(method || "cash").trim().toLowerCase();
  if (VALID_PAYMENT_METHODS.has(raw)) return raw;
  if (raw === "momo" || raw === "mobile-money" || raw === "mobile money") return "mobile_money";
  if (raw === "credit_card" || raw === "debit_card" || raw === "credit" || raw === "debit" || raw === "pos") {
    return "card";
  }
  if (raw === "transfer" || raw === "bank" || raw === "wire") return "bank_transfer";
  if (raw === "folio" || raw === "room") return "room_charge";
  return "other";
}

let posSchemaEnsured = false;

export function resetPosOrderSchemaCacheForTests() {
  posSchemaEnsured = false;
}

/**
 * Ensures Neon PostgreSQL schema compatibility for POS order completion and offline sync
 * without failing when tables/columns use legacy vs canonical definitions.
 * Each DDL statement runs independently and safely no-ops in mocked unit tests.
 */
export async function ensurePosOrderSchema(): Promise<void> {
  if (posSchemaEnsured) return;

  const statements = [
    `ALTER TABLE kitchenorders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE kitchenorders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE kitchenorders ADD COLUMN IF NOT EXISTS kitchen_closed_at TIMESTAMPTZ`,
    `ALTER TABLE kitchenorders ADD COLUMN IF NOT EXISTS chefnotes TEXT`,
    `ALTER TABLE kitchenorders ADD COLUMN IF NOT EXISTS performed_by UUID`,
    `ALTER TABLE kitchenorders ALTER COLUMN items SET DEFAULT '[]'::jsonb`,
    `ALTER TABLE kitchenorders ALTER COLUMN items DROP NOT NULL`,
    `ALTER TABLE kitchenorders DROP CONSTRAINT IF EXISTS kitchenorders_performed_by_fkey`,
    `ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_performed_by_fkey`,
    `CREATE TABLE IF NOT EXISTS kitchen_orderitems (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kitchenorderid UUID NOT NULL REFERENCES kitchenorders(id) ON DELETE CASCADE,
      menuitemid UUID,
      name VARCHAR(255) NOT NULL,
      price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      category VARCHAR(100),
      quantity INT NOT NULL DEFAULT 1,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      preptime INT DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS discount_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID,
      item_name VARCHAR(255) NOT NULL,
      original_unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      discounted_unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      discount_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
      quantity INT NOT NULL DEFAULT 1,
      applied_by TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE discount_applications DROP CONSTRAINT IF EXISTS discount_applications_applied_by_fkey`,
    `ALTER TABLE discount_applications ALTER COLUMN applied_by TYPE TEXT USING applied_by::text`,
    `CREATE TABLE IF NOT EXISTS order_idempotency_keys (
      idempotency_key VARCHAR(160) PRIMARY KEY,
      actor_id VARCHAR(255),
      order_id UUID NOT NULL,
      order_number VARCHAR(120),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE order_idempotency_keys ADD COLUMN IF NOT EXISTS order_number VARCHAR(120)`,
    `ALTER TABLE order_idempotency_keys DROP CONSTRAINT IF EXISTS order_idempotency_keys_actor_id_fkey`,
    `ALTER TABLE order_idempotency_keys ALTER COLUMN actor_id TYPE VARCHAR(255) USING actor_id::text`,
    `CREATE TABLE IF NOT EXISTS canonical_financial_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_key VARCHAR(255) UNIQUE NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'GHS',
      direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
      status VARCHAR(50) NOT NULL DEFAULT 'posted',
      source VARCHAR(100) NOT NULL,
      payment_method VARCHAR(50),
      entity_type VARCHAR(100),
      entity_id VARCHAR(255),
      original_entry_id VARCHAR(255),
      journal_type VARCHAR(50) DEFAULT 'operational',
      source_event_id VARCHAR(255),
      metadata JSONB DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE canonical_financial_ledger ADD COLUMN IF NOT EXISTS original_entry_id VARCHAR(255)`,
    `ALTER TABLE canonical_financial_ledger ADD COLUMN IF NOT EXISTS journal_type VARCHAR(50) DEFAULT 'operational'`,
    `ALTER TABLE canonical_financial_ledger ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(255)`,
  ];

  for (const stmt of statements) {
    await Promise.resolve(query(stmt)).catch(() => undefined);
  }

  posSchemaEnsured = true;
}

export interface QueryableClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export interface PosDeductibleItem {
  id?: string;
  name: string;
  quantity: number;
  barcode?: string;
  unitsPerSale?: number;
}

export interface PreparedMenuStockMap {
  byId: Map<string, Record<string, unknown>>;
}

/**
 * Locks direct inventory rows for UUID-identified menu items and validates stock
 * before inserting the kitchen order.
 */
export async function lockAndValidateDirectPosStock(
  client: QueryableClient,
  items: PosDeductibleItem[],
  options?: { allowZeroClamp?: boolean },
): Promise<PreparedMenuStockMap> {
  const validMenuIds = items
    .map((item) => toSafeUuid(item.id))
    .filter((id): id is string => Boolean(id));

  let rows: Record<string, unknown>[] = [];
  if (validMenuIds.length > 0) {
    // IMPORTANT: PostgreSQL forbids FOR UPDATE on the nullable side of a LEFT JOIN (SQLSTATE 0A000).
    // Query 1 reads menu_items + direct inventory metadata, and Query 2 locks matching inventory rows FOR UPDATE OF di.
    const stock = await client.query(
      `SELECT mi.id, mi.inventory_mode, mi.direct_inventory_id, mi.direct_units_per_sale, di.quantity
       FROM menu_items mi LEFT JOIN inventory di ON di.id = mi.direct_inventory_id
       WHERE mi.id = ANY($1::uuid[])`,
      [validMenuIds],
    );
    rows = (stock.rows || []).map((r) => ({ ...r }));

    const directInvIds = Array.from(
      new Set(
        rows
          .map((r) => toSafeUuid(r.direct_inventory_id))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (directInvIds.length > 0) {
      const locked = await client.query(
        `SELECT di.id, di.quantity
         FROM inventory di
         WHERE di.id = ANY($1::uuid[])
         FOR UPDATE OF di`,
        [directInvIds],
      );
      const lockedQtyById = new Map(
        (locked.rows || []).map((r) => [String(r.id), r.quantity]),
      );
      for (const row of rows) {
        const dId = row.direct_inventory_id ? String(row.direct_inventory_id) : "";
        if (dId && lockedQtyById.has(dId)) {
          row.quantity = lockedQtyById.get(dId);
        }
      }
    }
  }

  const byId = new Map(rows.map((row) => [String(row.id), row]));

  if (!options?.allowZeroClamp) {
    for (const item of items) {
      const safeId = toSafeUuid(item.id);
      const row = safeId ? byId.get(safeId) : undefined;
      if (row?.inventory_mode === "direct") {
        const required = Number(row.direct_units_per_sale || 1) * Number(item.quantity);
        if (!row.direct_inventory_id || Number(row.quantity) < required) {
          throw new Error(`${item.name} is out of stock`);
        }
      }
    }
  }

  return { byId };
}

/**
 * Subtracts inventory stock for a single sold line item across all 4 menu-to-inventory linkage modes:
 *   1. Direct mode (`menu_items.inventory_mode = 'direct'` + `direct_inventory_id`)
 *   2. Recipe ingredients (`recipe_ingredients` rows with UOM/density/chef-yield conversion)
 *   3. Linked inventory (`menu_items.direct_inventory_id` or `inventory.menu_item_id = mi.id` when 0 recipe rows)
 *   4. Standalone name / SKU fallback (`LOWER(TRIM(inventory.name)) = LOWER(TRIM(item.name))` or barcode/SKU match,
 *      covering items like '8 PM (Big Size)' stocked directly in inventory without recipe rows)
 *
 * Updates `container_count` proportionally alongside `quantity` so `GET /api/inventory` never
 * resurrects sold-out items back to their initial container count.
 */
export async function deductSingleOrderItemInventory(
  client: QueryableClient,
  item: PosDeductibleItem,
  context: {
    preparedStock?: PreparedMenuStockMap;
    orderNumber: string;
    orderId: string;
    actorId?: string | null;
    sourceType?: string;
    allowZeroClamp?: boolean;
  },
): Promise<void> {
  const safeMenuUuid = toSafeUuid(item.id);
  const safeActorUuid = toSafeUuid(context.actorId);
  const sourceType = context.sourceType || "pos_order";
  const allowZeroClamp = Boolean(context.allowZeroClamp);
  const row = safeMenuUuid ? context.preparedStock?.byId.get(safeMenuUuid) : undefined;

  const applyDecrement = async (
    inventoryId: string,
    deduction: number,
    reason: string,
    outOfStockMessage?: string,
  ) => {
    if (!Number.isFinite(deduction) || deduction <= 0) return;

    const updated = await client.query(
      `UPDATE inventory SET quantity = quantity - $1,
         container_count = CASE
           WHEN COALESCE(quantity_per_container, 0) > 0 THEN ROUND(GREATEST(0, quantity - $1::numeric) / quantity_per_container, 4)
           ELSE container_count
         END,
         last_updated = NOW()
       WHERE id = $2 AND quantity >= $1::numeric`,
      [deduction, inventoryId],
    );

    if (updated.rowCount !== 1) {
      if (allowZeroClamp) {
        await client.query(
          `UPDATE inventory
           SET quantity = GREATEST(0, quantity - $1::numeric),
               container_count = CASE
                 WHEN COALESCE(quantity_per_container, 0) > 0 THEN ROUND(GREATEST(0, quantity - $1::numeric) / quantity_per_container, 4)
                 ELSE container_count
               END,
               last_updated = NOW()
           WHERE id = $2`,
          [deduction, inventoryId],
        );
      } else {
        throw new Error(outOfStockMessage || `${item.name} is out of stock`);
      }
    }

    await client.query(
      `INSERT INTO inventory_movements (inventory_id, menu_item_id, quantity_delta, movement_type, source_type, source_id, order_id, reason, actor_id)
       VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7, $8)`,
      [
        inventoryId,
        safeMenuUuid,
        -deduction,
        sourceType,
        context.orderNumber,
        String(context.orderId),
        reason,
        safeActorUuid,
      ],
    );
  };

  // Tier 1: Explicit direct-stock menu item
  if (row?.inventory_mode === "direct" && row.direct_inventory_id) {
    const unitsPerSale = Number(row.direct_units_per_sale || item.unitsPerSale || 1);
    const deduction = (unitsPerSale > 0 ? unitsPerSale : 1) * Number(item.quantity);
    await applyDecrement(
      String(row.direct_inventory_id),
      deduction,
      `Direct sale deduction for ${item.name}`,
    );
    return;
  }

  // Tier 2: Recipe-based menu item with configured ingredients
  if (safeMenuUuid) {
    const ingredients = await client.query(
      `SELECT r.inventory_item_id, r.quantity, r.unit, i.quantity AS inventory_quantity,
              i.unit AS inventory_unit,
              i.recipe_unit AS inventory_recipe_unit,
              COALESCE(i.chef_yield_per_stock_unit, active_uom.conversion_factor_to_base * active_uom.yield_factor, i.conversion_ratio) AS inventory_conversion_ratio,
              i.conversion_type AS inventory_conversion_type, i.density_g_per_ml AS inventory_density, i.name
       FROM recipe_ingredients r
       JOIN inventory i ON i.id = r.inventory_item_id
       LEFT JOIN LATERAL (
         SELECT u.base_unit, u.conversion_factor_to_base, u.yield_factor
         FROM inventory_item_uoms u
         WHERE u.inventory_id = i.id
           AND u.purchase_unit = ${inventoryUnitSql}
           AND u.is_active = true
           AND (u.effective_to IS NULL OR u.effective_to > CURRENT_TIMESTAMP)
         ORDER BY u.effective_from DESC
         LIMIT 1
       ) active_uom ON true
       WHERE r.menu_item_id = $1
       FOR UPDATE OF i`,
      [safeMenuUuid],
    );

    if (ingredients.rows.length > 0) {
      for (const ingredient of ingredients.rows) {
        const requiredQuantity = Number(ingredient.quantity) * Number(item.quantity);
        const density =
          ingredient.inventory_density !== null && ingredient.inventory_density !== undefined
            ? Number(ingredient.inventory_density)
            : null;
        const conversionRatio =
          ingredient.inventory_conversion_ratio !== null &&
          ingredient.inventory_conversion_ratio !== undefined &&
          ingredient.inventory_conversion_ratio !== ""
            ? Number(ingredient.inventory_conversion_ratio)
            : null;
        const deduction = getRecipeDeductionQuantity(
          requiredQuantity,
          String(ingredient.unit || ""),
          String(ingredient.inventory_unit || ""),
          conversionRatio,
          density,
        );
        if (deduction === null) {
          throw new Error(
            `${ingredient.name} uses incompatible units (${ingredient.unit} and ${ingredient.inventory_unit}); configure a compatible unit or density before selling ${item.name}`,
          );
        }
        await applyDecrement(
          String(ingredient.inventory_item_id),
          deduction,
          `Recipe deduction for ${item.name}`,
          `${item.name} is out of stock: ${ingredient.name}`,
        );
      }
      return;
    }

    // Tier 3: Menu item linked via direct_inventory_id or inventory.menu_item_id (with 0 recipe rows)
    const directCandidateUuid = toSafeUuid(row?.direct_inventory_id);
    const linkedInventory = await client.query(
      `SELECT i.id, i.quantity, mi.barcode, mi.direct_units_per_sale
       FROM inventory i
       LEFT JOIN menu_items mi ON mi.id = $1::uuid
       WHERE i.menu_item_id = $1::uuid
          OR ($2::uuid IS NOT NULL AND i.id = $2::uuid)
       ORDER BY (i.id = $2::uuid) DESC NULLS LAST, i.quantity DESC
       LIMIT 1
       FOR UPDATE OF i`,
      [safeMenuUuid, directCandidateUuid],
    );

    if (linkedInventory.rows[0]?.id) {
      const unitsPerSale = Number(
        row?.direct_units_per_sale ?? linkedInventory.rows[0].direct_units_per_sale ?? item.unitsPerSale ?? 1,
      );
      const deduction = (unitsPerSale > 0 ? unitsPerSale : 1) * Number(item.quantity);
      await applyDecrement(
        String(linkedInventory.rows[0].id),
        deduction,
        `Linked inventory sale deduction for ${item.name}`,
      );
      return;
    }
  }

  // Tier 4: Standalone inventory item matched by name or barcode/SKU (e.g., '8 PM (Big Size)')
  const itemName = String(item.name || "").trim();
  const itemBarcode = String(item.barcode || "").trim();
  if (!itemName && !itemBarcode) return;

  let menuMetaUnitsPerSale = Number(row?.direct_units_per_sale || item.unitsPerSale || 1);
  let menuBarcode = itemBarcode;
  if (safeMenuUuid && !menuBarcode) {
    const menuMeta = await client.query(
      `SELECT barcode, direct_units_per_sale FROM menu_items WHERE id = $1::uuid LIMIT 1`,
      [safeMenuUuid],
    );
    if (menuMeta.rows[0]) {
      menuBarcode = String(menuMeta.rows[0].barcode || "").trim();
      if (Number(menuMeta.rows[0].direct_units_per_sale) > 0) {
        menuMetaUnitsPerSale = Number(menuMeta.rows[0].direct_units_per_sale);
      }
    }
  }

  const fallbackInv = await client.query(
    `SELECT i.id, i.quantity
     FROM inventory i
     WHERE ($1::text <> '' AND LOWER(TRIM(COALESCE(i.name, ''))) = LOWER(TRIM($1::text)))
        OR ($2::text <> '' AND LOWER(TRIM(COALESCE(i.sku, ''))) = LOWER(TRIM($2::text)))
     ORDER BY (LOWER(TRIM(COALESCE(i.name, ''))) = LOWER(TRIM($1::text))) DESC, i.quantity DESC
     LIMIT 1
     FOR UPDATE OF i`,
    [itemName, menuBarcode],
  );

  if (fallbackInv.rows[0]?.id) {
    const deduction = (menuMetaUnitsPerSale > 0 ? menuMetaUnitsPerSale : 1) * Number(item.quantity);
    await applyDecrement(
      String(fallbackInv.rows[0].id),
      deduction,
      `Inventory name/SKU sale deduction for ${item.name}`,
    );
  }
}
