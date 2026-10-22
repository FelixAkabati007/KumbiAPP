import { query } from "@/lib/db";
import { calculateMenuAvailability, type AvailabilityIngredient } from "@/lib/menu-availability";
import { getInventoryUnitSqlExpression } from "@/lib/inventory-units";

const inventoryUnitSql = getInventoryUnitSqlExpression("i.unit");

export type CanonicalMenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  isAvailable: boolean;
  availabilityMode: "manual" | "automatic";
  inventoryMode: "recipe" | "direct";
  category: string;
  inStock: boolean;
  stockStatus: string;
  stockShortages: string[];
  shortageDetails: unknown[];
};

type CanonicalMenuLedgerRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  is_available: boolean;
  availability_mode: "manual" | "automatic";
  inventory_mode: "recipe" | "direct";
  direct_quantity: number | string | null;
  direct_units_per_sale: number | string | null;
  ingredients: AvailabilityIngredient[] | null;
  legacy_quantity: number | string | null;
  category_slug: string | null;
};

export async function getCanonicalMenuLedger(options?: { activeOnly?: boolean }) {
  const result = await query(`
    SELECT mi.id, mi.name, mi.description, mi.price, mi.is_available,
           mi.availability_mode, mi.inventory_mode, mi.direct_inventory_id,
           mi.direct_units_per_sale, mi.created_at, di.quantity AS direct_quantity,
           legacy_i.quantity AS legacy_quantity, c.slug AS category_slug,
           COALESCE(json_agg(json_build_object(
             'name', i.name, 'requiredQuantity', ri.quantity,
             'recipeUnit', ri.unit, 'availableQuantity', i.quantity,
             'stockUnit', COALESCE(active_uom.base_unit, i.base_unit, i.unit), 'conversionRatio', COALESCE(active_uom.conversion_factor_to_base * active_uom.yield_factor, i.chef_yield_per_stock_unit, i.conversion_ratio),
             'densityGPerMl', i.density_g_per_ml
           )) FILTER (WHERE ri.id IS NOT NULL), '[]') AS ingredients
    FROM menu_items mi
    LEFT JOIN categories c ON c.id = mi.category_id
    LEFT JOIN inventory di ON di.id = mi.direct_inventory_id
    LEFT JOIN inventory legacy_i ON legacy_i.name = mi.name AND mi.inventory_mode = 'recipe'
    LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = mi.id
    LEFT JOIN inventory i ON i.id = ri.inventory_item_id
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
    GROUP BY mi.id, mi.created_at, c.slug, di.quantity, legacy_i.quantity
    ORDER BY mi.created_at DESC
  `);

  const items = (result.rows as CanonicalMenuLedgerRow[]).map((row) => {
    const availability = calculateMenuAvailability({
      inventoryMode: row.inventory_mode,
      availabilityMode: row.availability_mode,
      isAvailable: row.is_available,
      directQuantity: row.direct_quantity == null ? null : Number(row.direct_quantity),
      directUnitsPerSale: Number(row.direct_units_per_sale ?? 1),
      ingredients: row.ingredients ?? [],
      legacyQuantity: row.legacy_quantity == null ? null : Number(row.legacy_quantity),
    });
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      price: Number(row.price),
      isAvailable: row.is_available,
      availabilityMode: row.availability_mode,
      inventoryMode: row.inventory_mode,
      category: row.category_slug ?? "ghanaian",
      inStock: availability.inStock,
      stockStatus: availability.stockStatus,
      stockShortages: availability.stockShortages,
      shortageDetails: availability.shortageDetails,
    } satisfies CanonicalMenuItem;
  });

  return options?.activeOnly ? items.filter((item) => item.isAvailable && item.inStock) : items;
}

export async function getCanonicalInventoryMenuLedger() {
  return getCanonicalMenuLedger({ activeOnly: false });
}
