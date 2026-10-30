import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { updateSystemState } from "@/lib/system-sync";
import { publishRealtime } from "@/lib/realtime";
import {
  isInventoryUnit,
  validateInventoryNumber,
} from "@/lib/inventory-validation";
import {
  isInventoryBaseUnit,
  getInventoryBaseUnit,
  getInventoryUnitCompatibilityError,
  normalizeInventoryUnit,
  getInventoryDeductionQuantity,
} from "@/lib/inventory-units";
import { getInventoryCostValidationError } from "@/lib/inventory-cost";
import { getCanonicalInventoryMenuLedger } from "@/lib/canonical-menu-ledger";
import { getInventoryUnitSqlExpression } from "@/lib/inventory-units";
const inventoryUnitSql = `COALESCE(${getInventoryUnitSqlExpression("i.container_unit")}, ${getInventoryUnitSqlExpression("i.unit")})`;

export async function GET() {
  try {
    const access = await requirePermission("inventory");
    if (access.error) return access.error;
    const res = await query(
      `SELECT i.*, mi.name as menu_item_name, mi.barcode as menu_item_barcode,
        active_uom.base_unit AS active_uom_base_unit,
        active_uom.conversion_factor_to_base AS active_uom_factor,
        CASE WHEN LOWER(COALESCE(i.unit, '')) = LOWER(COALESCE(i.base_unit, '')) THEN false
             WHEN active_uom.inventory_id IS NOT NULL THEN false
             ELSE true END AS conversion_rule_missing
       FROM inventory i
       LEFT JOIN menu_items mi ON mi.id = i.menu_item_id
       LEFT JOIN LATERAL (
         SELECT u.inventory_id, u.base_unit, u.conversion_factor_to_base
         FROM inventory_item_uoms u
         WHERE u.inventory_id = i.id AND u.purchase_unit = ${inventoryUnitSql}
           AND u.is_active = true AND (u.effective_to IS NULL OR u.effective_to > CURRENT_TIMESTAMP)
         ORDER BY u.effective_from DESC LIMIT 1
       ) active_uom ON true
       ORDER BY i.last_updated DESC`,
    );
    const canonicalMenuLedger = await getCanonicalInventoryMenuLedger();
    const availabilityByInventoryName = new Map(canonicalMenuLedger.map((item) => [item.name, item]));
    return NextResponse.json(
      res.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.menu_item_name ?? r.name ?? "",
        sku: r.menu_item_barcode ?? r.sku ?? "",
        category: r.category ?? "ingredient",
        quantity: String(r.quantity),
        unit: r.unit ?? "units",
        containerUnit: r.container_unit ?? "",
        quantityPerContainer: String(r.quantity_per_container ?? 1),
        containerCount: String(r.container_count ?? 0),
        costPerContainer: String(r.cost_per_container ?? 0),
        costPerItem: String(r.cost_per_item ?? 0),
        reorderLevel: String(r.reorder_level ?? 0),
        cost: String(r.cost_price ?? 0),
        supplier: r.supplier ?? "",
        lastUpdated: r.last_updated ?? undefined,
        menuItemId: r.menu_item_id ?? undefined,
        baseUnit: r.active_uom_base_unit ?? r.base_unit ?? undefined,
        recipeUnit: r.active_uom_base_unit ?? r.recipe_unit ?? undefined,
        conversionRatio: String(r.active_uom_factor ?? r.conversion_ratio ?? ""),
        conversionType: r.conversion_type ?? "standard",
        conversionRuleMissing: Boolean(r.conversion_rule_missing),
        chefYieldPerStockUnit: r.chef_yield_per_stock_unit != null ? String(r.chef_yield_per_stock_unit) : undefined,
        densityGPerMl: r.density_g_per_ml != null ? String(r.density_g_per_ml) : undefined,
        canonicalMenuAvailability: availabilityByInventoryName.get(String(r.menu_item_name ?? r.name))?.inStock ?? null,
      })),
    );
  } catch (error) {
    console.error("Inventory GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = await requirePermission("inventory");
    if (access.error) return access.error;
    const session = access.session;
    const body = await req.json();
    const {
      menuItemId,
      quantity,
      unit,
      reorderLevel,
      cost,
      supplier,
      name,
      sku,
      category,
      containerUnit,
      quantityPerContainer,
      containerCount,
      costPerContainer,
      costPerItem,
      baseUnit,
      densityGPerMl,
      recipeUnit,
      conversionRatio,
      conversionType,
      chefYieldPerStockUnit,
    } = body;
    for (const [field, value] of Object.entries({
      quantity,
      reorderLevel,
      cost,
      densityGPerMl,
      chefYieldPerStockUnit,
    })) {
      const error = validateInventoryNumber(value, field);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    if (unit && !isInventoryUnit(String(unit)))
      return NextResponse.json(
        { error: "Invalid inventory unit" },
        { status: 400 },
      );
    if (containerUnit && !isInventoryUnit(String(containerUnit)))
      return NextResponse.json(
        { error: "Invalid container unit" },
        { status: 400 },
      );
    if (baseUnit && !isInventoryBaseUnit(String(baseUnit)))
      return NextResponse.json({ error: "Invalid base unit" }, { status: 400 });
    if (recipeUnit && !isInventoryUnit(String(recipeUnit)))
      return NextResponse.json(
        { error: "Invalid recipe unit" },
        { status: 400 },
      );
    const normalizedUnit = (containerUnit || unit) ? normalizeInventoryUnit(String(containerUnit || unit)) : null;
    const normalizedRecipeUnit = recipeUnit
      ? normalizeInventoryUnit(String(recipeUnit))
      : normalizedUnit;
    const unitCompatibilityError =
      normalizedRecipeUnit && normalizedUnit
        ? getInventoryUnitCompatibilityError(
            normalizedRecipeUnit,
            normalizedUnit,
            densityGPerMl ? Number(densityGPerMl) : null,
          )
        : null;
    const chefYield = chefYieldPerStockUnit === "" || chefYieldPerStockUnit == null ? null : Number(chefYieldPerStockUnit);
    if (chefYield !== null && (!Number.isFinite(chefYield) || chefYield <= 0)) return NextResponse.json({ error: "Chef yield must be greater than zero" }, { status: 400 });
    const hasChefYield = chefYield !== null;
    if (unitCompatibilityError && !hasChefYield)
      return NextResponse.json(
        { error: unitCompatibilityError },
        { status: 400 },
      );
    if (
      conversionType &&
      !["standard", "pack"].includes(String(conversionType))
    )
      return NextResponse.json(
        { error: "Invalid conversion type" },
        { status: 400 },
      );
    const ratioError = validateInventoryNumber(
      conversionRatio,
      "Conversion ratio",
    );
    if (
      ratioError ||
      (conversionRatio !== undefined &&
        conversionRatio !== "" &&
        Number(conversionRatio) <= 0)
    )
      return NextResponse.json(
        { error: ratioError ?? "Conversion ratio must be greater than zero" },
        { status: 400 },
      );
    for (const [field, value] of Object.entries({
      quantityPerContainer,
      containerCount,
      costPerContainer,
      costPerItem,
    })) {
      const error = validateInventoryNumber(value, field);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    const costValidationError = getInventoryCostValidationError(
      costPerContainer ?? 0,
      quantityPerContainer ?? 0,
    );
    if (costValidationError)
      return NextResponse.json({ error: costValidationError }, { status: 400 });
    const normalizedQuantity =
      quantityPerContainer && containerCount
        ? Number(quantityPerContainer) * Number(containerCount)
        : Number(quantity ?? 0);
    const normalizedCostPerItem =
      costPerContainer && quantityPerContainer
        ? Number(costPerContainer) / Number(quantityPerContainer)
        : Number(costPerItem ?? 0);
    const resolvedBaseUnit = baseUnit || getInventoryBaseUnit(unit) || null;
    const resolvedDensity = densityGPerMl ? Number(densityGPerMl) : null;
    const resolvedRecipeUnit =
      recipeUnit || getInventoryBaseUnit(unit) || unit || "unit";
    const autoRatio = (normalizedUnit && normalizedRecipeUnit) ? getInventoryDeductionQuantity(1, normalizedUnit, normalizedRecipeUnit, resolvedDensity) : null;
    const resolvedConversionRatio = conversionRatio ? Number(conversionRatio) : (quantityPerContainer && Number(quantityPerContainer) > 0) ? Number(quantityPerContainer) : (autoRatio && autoRatio > 0) ? autoRatio : 1;
    const resolvedConversionType =
      conversionType === "pack" ? "pack" : "standard";
    if (!menuItemId && !String(name ?? "").trim())
      return NextResponse.json(
        { error: "Name is required for standalone inventory items" },
        { status: 400 },
      );
    const canonicalNow = await getCanonicalTransactionTimestamp();
    const res = await transaction(async (client) => {
      let res;
      if (menuItemId) {
      res = await client.query(
        `INSERT INTO inventory (menu_item_id, quantity, unit, reorder_level, cost_price, supplier, container_unit, quantity_per_container, container_count, cost_per_container, cost_per_item, base_unit, density_g_per_ml, recipe_unit, conversion_ratio, conversion_type, chef_yield_per_stock_unit, last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::timestamptz) ON CONFLICT (menu_item_id) DO UPDATE SET quantity=inventory.quantity + EXCLUDED.quantity, unit=EXCLUDED.unit, reorder_level=EXCLUDED.reorder_level, cost_price=EXCLUDED.cost_price, supplier=EXCLUDED.supplier, container_unit=EXCLUDED.container_unit, quantity_per_container=EXCLUDED.quantity_per_container, container_count=EXCLUDED.container_count, cost_per_container=EXCLUDED.cost_per_container, cost_per_item=EXCLUDED.cost_per_item, base_unit=EXCLUDED.base_unit, density_g_per_ml=EXCLUDED.density_g_per_ml, recipe_unit=EXCLUDED.recipe_unit, conversion_ratio=EXCLUDED.conversion_ratio, conversion_type=EXCLUDED.conversion_type, chef_yield_per_stock_unit=EXCLUDED.chef_yield_per_stock_unit, last_updated=EXCLUDED.last_updated RETURNING id, quantity`,
        [
          menuItemId,
          normalizedQuantity,
          unit ?? "units",
          reorderLevel ?? 0,
          cost ?? 0,
          supplier ?? null,
          containerUnit ?? null,
          quantityPerContainer ?? 1,
          containerCount ?? 0,
          costPerContainer ?? 0,
          normalizedCostPerItem,
          resolvedBaseUnit,
          resolvedDensity,
          resolvedRecipeUnit,
          resolvedConversionRatio,
          resolvedConversionType,
          chefYield,
          canonicalNow,
        ],
      );
    } else {
      res = await client.query(
        `INSERT INTO inventory (name, sku, category, quantity, unit, reorder_level, cost_price, supplier, container_unit, quantity_per_container, container_count, cost_per_container, cost_per_item, base_unit, density_g_per_ml, recipe_unit, conversion_ratio, conversion_type, chef_yield_per_stock_unit, last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::timestamptz) RETURNING id`,
        [
          String(name).trim(),
          sku ?? "",
          category ?? "ingredient",
          normalizedQuantity,
          unit ?? "units",
          reorderLevel ?? 0,
          cost ?? 0,
          supplier ?? null,
          containerUnit ?? null,
          quantityPerContainer ?? 1,
          containerCount ?? 0,
          costPerContainer ?? 0,
          normalizedCostPerItem,
          resolvedBaseUnit,
          resolvedDensity,
          resolvedRecipeUnit,
          resolvedConversionRatio,
          resolvedConversionType,
          chefYield,
          canonicalNow,
        ],
      );
    }

    const purchaseUnit = normalizeInventoryUnit(String(containerUnit ?? unit ?? "unit"));
    const activeBaseUnit = normalizeInventoryUnit(String(resolvedBaseUnit ?? resolvedRecipeUnit ?? "unit"));
    if (purchaseUnit && activeBaseUnit && Number.isFinite(resolvedConversionRatio) && resolvedConversionRatio > 0) {
      await client.query(
        "UPDATE inventory_item_uoms SET is_active = false, effective_to = CURRENT_TIMESTAMP WHERE inventory_id = $1 AND is_active = true",
        [res.rows[0].id],
      );
      await client.query(
        `INSERT INTO inventory_item_uoms
          (inventory_id, purchase_unit, base_unit, conversion_factor_to_base, density_g_per_ml, yield_factor, is_active, effective_from)
         VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP)`,
        [res.rows[0].id, purchaseUnit, activeBaseUnit, resolvedConversionRatio, resolvedDensity, chefYield ?? 1],
      );
    }

    return res;
    });

    await logAudit({
      performedBy: session?.id,
      action: "UPDATE_INVENTORY",
      entityType: "INVENTORY",
      entityId: res.rows[0].id,
      details: {
        ...body,
        actor: { id: session.id, name: session.email, role: session.role },
        item: {
          name: String(name ?? "").trim(),
          sku: String(sku ?? ""),
          category: category ?? "ingredient",
          unit: unit ?? "units",
          containerUnit: containerUnit ?? "",
          quantityPerContainer: String(quantityPerContainer ?? 1),
          containerCount: String(containerCount ?? 0),
          costPerContainer: String(costPerContainer ?? 0),
          costPerItem: String(normalizedCostPerItem),
          reorderLevel: String(reorderLevel ?? 0),
          cost: String(cost ?? 0),
          supplier: supplier ?? "",
        },
      },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      occurredAt: canonicalNow,
    });
    await updateSystemState("inventory");
    await publishRealtime("inventory.updated", res.rows[0].id);
    return NextResponse.json({ id: res.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Inventory POST failed:", error);
    return NextResponse.json(
      { error: "Failed to upsert inventory" },
      { status: 500 },
    );
  }
}
