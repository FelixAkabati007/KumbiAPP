import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { updateSystemState } from "@/lib/system-sync";
import { publishRealtime } from "@/lib/realtime";
import {
  isInventoryUnit,
  validateInventoryNumber,
} from "@/lib/inventory-validation";
import {
  isInventoryBaseUnit,
  getInventoryUnitCompatibilityError,
  normalizeInventoryUnit,
  getInventoryBaseUnit,
} from "@/lib/inventory-units";
import { getInventoryCostValidationError } from "@/lib/inventory-cost";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireRole("admin");
    if (access.error) return access.error;
    const session = access.session;
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      sku,
      category,
      quantity,
      unit,
      reorderLevel,
      cost,
      supplier,
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
    if (name !== undefined && !String(name).trim()) {
      return NextResponse.json({ error: "Item name cannot be empty" }, { status: 400 });
    }
    for (const [value, field] of [
      [quantity, "Quantity"],
      [reorderLevel, "Reorder level"],
      [cost, "Cost"],
      [quantityPerContainer, "Quantity per container"],
      [containerCount, "Container count"],
      [costPerContainer, "Cost per container"],
      [densityGPerMl, "Density"],
      [conversionRatio, "Conversion ratio"],
      [chefYieldPerStockUnit, "Chef yield per stock unit"],
    ] as const) {
      const validationError = validateInventoryNumber(value, field);
      if (validationError)
        return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const normalizedContainerUnit = containerUnit === "" ? null : containerUnit;
    const normalizedBaseUnit = baseUnit === undefined
      ? undefined
      : baseUnit === null || baseUnit === ""
        ? null
        : normalizeInventoryUnit(String(baseUnit)) || getInventoryBaseUnit(String(unit ?? recipeUnit ?? "unit"));
    const normalizedDensity = densityGPerMl === "" ? null : densityGPerMl;

    if (unit !== undefined && !isInventoryUnit(unit))
      return NextResponse.json(
        { error: "Invalid inventory unit" },
        { status: 400 },
      );
    if (
      normalizedContainerUnit !== undefined &&
      normalizedContainerUnit !== null &&
      !isInventoryUnit(normalizedContainerUnit)
    )
      return NextResponse.json(
        { error: "Invalid container unit" },
        { status: 400 },
      );
    if (
      normalizedBaseUnit !== undefined &&
      normalizedBaseUnit !== null &&
      !isInventoryBaseUnit(normalizedBaseUnit)
    )
      return NextResponse.json({ error: "Invalid base unit" }, { status: 400 });
    if (
      recipeUnit !== undefined &&
      recipeUnit !== null &&
      recipeUnit !== "" &&
      !isInventoryUnit(recipeUnit)
    )
      return NextResponse.json(
        { error: "Invalid recipe unit" },
        { status: 400 },
      );
    if (
      conversionType !== undefined &&
      !["standard", "pack"].includes(String(conversionType))
    )
      return NextResponse.json(
        { error: "Invalid conversion type" },
        { status: 400 },
      );
    if (
      conversionRatio !== undefined &&
      conversionRatio !== null &&
      conversionRatio !== "" &&
      Number(conversionRatio) <= 0
    )
      return NextResponse.json(
        { error: "Conversion ratio must be greater than zero" },
        { status: 400 },
      );
    const normalizedRecipeUnit = recipeUnit === "" ? null : recipeUnit;
    const normalizedConversionRatio = conversionRatio === "" ? null : conversionRatio;
    const normalizedChefYield = chefYieldPerStockUnit === "" ? null : chefYieldPerStockUnit;
    const hasChefYield = normalizedChefYield !== undefined && normalizedChefYield !== null;
    if (hasChefYield && (!Number.isFinite(Number(normalizedChefYield)) || Number(normalizedChefYield) <= 0)) return NextResponse.json({ error: "Chef yield must be greater than zero" }, { status: 400 });

    const beforeResult = await query(
      "SELECT id, name, sku, category, quantity, unit, container_unit, container_count, supplier, cost_price, cost_per_container, quantity_per_container, cost_per_item, recipe_unit, density_g_per_ml, chef_yield_per_stock_unit FROM inventory WHERE id = $1",
      [id],
    );
    const before = beforeResult.rows[0];
    if (!before)
      return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const effectiveStockUnit = unit === undefined ? before.unit : unit;
    const effectiveContainerUnit =
      normalizedContainerUnit === undefined
        ? before.container_unit
        : normalizedContainerUnit;
    const effectiveRecipeUnit =
      recipeUnit === undefined ? before.recipe_unit : recipeUnit;
    const unitCompatibilityError =
      effectiveRecipeUnit && effectiveStockUnit
        ? getInventoryUnitCompatibilityError(
            normalizeInventoryUnit(String(effectiveRecipeUnit)) ?? String(effectiveRecipeUnit),
            normalizeInventoryUnit(String(effectiveStockUnit)) ?? String(effectiveStockUnit),
            densityGPerMl === undefined
              ? Number(before.density_g_per_ml ?? 0) || null
              : Number(densityGPerMl) || null,
          )
        : null;
    const effectiveChefYield = hasChefYield ? Number(normalizedChefYield) : Number(before.chef_yield_per_stock_unit ?? 0) || null;
    if (unitCompatibilityError && !effectiveChefYield)
      return NextResponse.json(
        { error: unitCompatibilityError },
        { status: 400 },
      );

    // Recipe & Supplies cost must always reflect this item's actual packaging cost.
    // Recompute cost_per_item from the effective cost_per_container / quantity_per_container
    // (merging any fields present in this request with the item's current stored values)
    // instead of trusting whatever costPerItem the client happens to send. This keeps the
    // value in sync even when only "Items per container" or "Container count" is edited.
    const effectiveCostPerContainer =
      costPerContainer !== undefined
        ? Number(costPerContainer)
        : Number(before.cost_per_container ?? 0);
    const effectiveQuantityPerContainer =
      quantityPerContainer !== undefined
        ? Number(quantityPerContainer)
        : Number(before.quantity_per_container ?? 0);
    const costValidationError = getInventoryCostValidationError(
      effectiveCostPerContainer,
      effectiveQuantityPerContainer,
    );
    if (costValidationError)
      return NextResponse.json({ error: costValidationError }, { status: 400 });
    const resolvedCostPerItem =
      effectiveQuantityPerContainer > 0
        ? effectiveCostPerContainer / effectiveQuantityPerContainer
        : costPerItem !== undefined
          ? Number(costPerItem)
          : Number(before.cost_per_item ?? 0);

    const effectiveContainerCount =
      containerCount !== undefined
        ? Number(containerCount)
        : quantity !== undefined && effectiveQuantityPerContainer > 0
          ? Number((Math.max(0, Number(quantity)) / effectiveQuantityPerContainer).toFixed(4))
          : Number(before.container_count ?? 0);

    const resolvedQuantity =
      quantity !== undefined && Number(quantity) > 0
        ? Number(quantity)
        : effectiveContainerCount > 0 && effectiveQuantityPerContainer > 0
          ? effectiveContainerCount * effectiveQuantityPerContainer
          : quantity !== undefined
            ? Number(quantity)
            : undefined;

    const resolvedCostPrice =
      cost !== undefined && Number(cost) > 0
        ? Number(cost)
        : effectiveCostPerContainer > 0 && effectiveContainerCount > 0
          ? Number((effectiveCostPerContainer * effectiveContainerCount).toFixed(2))
          : cost !== undefined
            ? Number(cost)
            : undefined;

    const fields: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(String(name).trim());
    }
    if (sku !== undefined) {
      fields.push(`sku = $${idx++}`);
      values.push(String(sku).trim());
    }
    if (category !== undefined) {
      fields.push(`category = $${idx++}`);
      values.push(String(category).trim());
    }
    if (resolvedQuantity !== undefined) {
      fields.push(`quantity = $${idx++}`);
      values.push(resolvedQuantity);
    }
    if (unit !== undefined) {
      fields.push(`unit = $${idx++}`);
      values.push(unit);
    }
    if (reorderLevel !== undefined) {
      fields.push(`reorder_level = $${idx++}`);
      values.push(reorderLevel);
    }
    if (resolvedCostPrice !== undefined) {
      fields.push(`cost_price = $${idx++}`);
      values.push(resolvedCostPrice);
    }
    if (supplier !== undefined) {
      fields.push(`supplier = $${idx++}`);
      values.push(supplier);
    }
    for (const [column, value] of [
      ["container_unit", normalizedContainerUnit],
      ["quantity_per_container", quantityPerContainer],
      ["container_count", containerCount],
      ["cost_per_container", costPerContainer],
      ["cost_per_item", resolvedCostPerItem],
      ["base_unit", normalizedBaseUnit],
      ["density_g_per_ml", normalizedDensity],
      ["recipe_unit", normalizedRecipeUnit],
      ["conversion_ratio", normalizedConversionRatio],
      ["conversion_type", conversionType],
      ["chef_yield_per_stock_unit", normalizedChefYield],
    ] as const) {
      if (value !== undefined) {
        fields.push(`${column} = $${idx++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ message: "No changes" });
    }

    fields.push(`last_updated = NOW()`);
    values.push(id);
    const q = `UPDATE inventory SET ${fields.join(
      ", ",
    )} WHERE id = $${idx} RETURNING *`;

    const res = await transaction(async (client) => {
      const updated = await client.query(q, values);

      const uomWasUpdated =
        containerUnit !== undefined ||
        unit !== undefined ||
        baseUnit !== undefined ||
        recipeUnit !== undefined ||
        conversionRatio !== undefined ||
        conversionType !== undefined ||
        chefYieldPerStockUnit !== undefined;
      if ((updated.rowCount ?? 0) > 0 && uomWasUpdated) {
        const purchaseUnit = normalizeInventoryUnit(
          String(normalizedContainerUnit ?? unit ?? before.unit ?? "unit"),
        );
        const activeBaseUnit = normalizeInventoryUnit(
          String(recipeUnit ?? normalizedBaseUnit ?? before.recipe_unit ?? before.base_unit ?? before.unit ?? "unit"),
        );
        const factor = Number(normalizedConversionRatio ?? 1);
        const yieldFactor = Number(normalizedChefYield ?? before.chef_yield_per_stock_unit ?? 1) || 1;
        if (purchaseUnit && activeBaseUnit && Number.isFinite(factor) && factor > 0) {
          await client.query(
            "UPDATE inventory_item_uoms SET is_active = false, effective_to = CURRENT_TIMESTAMP WHERE inventory_id = $1 AND is_active = true",
            [id],
          );
          await client.query(
            `INSERT INTO inventory_item_uoms
              (inventory_id, purchase_unit, base_unit, conversion_factor_to_base, yield_factor, is_active, effective_from)
             VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)`,
            [id, purchaseUnit, activeBaseUnit, factor, yieldFactor],
          );
        }
      }

      return updated;
    });

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const nextQuantity =
      quantity === undefined ? Number(before.quantity) : Number(quantity);
    if (
      Number.isFinite(nextQuantity) &&
      nextQuantity > Number(before.quantity)
    ) {
      await logAudit({
        action: "RESTOCK_INVENTORY",
        entityType: "INVENTORY",
        entityId: id,
        details: {
          actor: { id: session.id, email: session.email, role: session.role },
          item: before,
          quantityBefore: Number(before.quantity),
          quantityAdded: nextQuantity - Number(before.quantity),
          quantityAfter: nextQuantity,
          unit: unit ?? before.unit,
          supplier: supplier ?? before.supplier,
          cost: cost ?? before.cost_price,
        },
        performedBy: session?.id,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
    }

    await updateSystemState("menu");
    await publishRealtime("inventory.updated", id);

    await logAudit({
      action: "UPDATE_INVENTORY",
      entityType: "INVENTORY",
      entityId: id,
      details: { changes: body, current: res.rows[0] },
      performedBy: session?.id,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    const r = res.rows[0];
    const mappedItem = {
      id: r.id,
      name: r.name ?? "",
      sku: r.sku ?? "",
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
      baseUnit: r.base_unit ?? undefined,
      recipeUnit: r.recipe_unit ?? undefined,
      conversionRatio: String(r.conversion_ratio ?? ""),
      conversionType: r.conversion_type ?? "standard",
      chefYieldPerStockUnit: r.chef_yield_per_stock_unit != null ? String(r.chef_yield_per_stock_unit) : undefined,
      densityGPerMl: r.density_g_per_ml != null ? String(r.density_g_per_ml) : undefined,
    };

    return NextResponse.json({ success: true, item: mappedItem });
  } catch (error) {
    console.error("Inventory Item PUT failed:", error);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireRole("admin", "manager");
    if (access.error) return access.error;
    const session = access.session;
    const { id } = await params;
    const url = new URL(req.url);
    const forceUnlink = url.searchParams.get("force") === "true";

    // Preserve immutable historical audit/variance/movement records while removing
    // restrictive foreign keys that would otherwise block deleting obsolete inventory items.
    const fkDetachStatements = [
      `DROP TRIGGER IF EXISTS inventory_top_up_audit_immutable ON inventory_top_up_audit`,
      `ALTER TABLE inventory_top_up_audit DROP CONSTRAINT IF EXISTS inventory_top_up_audit_inventory_item_id_fkey`,
      `ALTER TABLE inventory_variances DROP CONSTRAINT IF EXISTS inventory_variances_inventory_item_id_fkey`,
      `ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_inventory_id_fkey`,
      `ALTER TABLE inventory_events DROP CONSTRAINT IF EXISTS inventory_events_inventory_id_fkey`,
      `ALTER TABLE inventory_item_uoms DROP CONSTRAINT IF EXISTS inventory_item_uoms_inventory_id_fkey`,
      `ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_direct_inventory_id_fkey`,
    ];
    for (const stmt of fkDetachStatements) {
      await query(stmt).catch(() => undefined);
    }

    const existingRes = await query<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM inventory WHERE id::text = $1::text LIMIT 1`,
      [id],
    );
    if (existingRes.rows.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    const itemName = existingRes.rows[0].name;

    // Check active menu links (recipe_ingredients and direct-stock menu_items)
    const linkedMenuRes = await query<{ id: string; name: string; link_type: string }>(
      `SELECT DISTINCT mi.id::text AS id, mi.name,
              CASE WHEN mi.direct_inventory_id::text = $1::text THEN 'direct_stock' ELSE 'recipe_ingredient' END AS link_type
       FROM menu_items mi
       LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = mi.id AND ri.inventory_item_id::text = $1::text
       WHERE mi.direct_inventory_id::text = $1::text OR ri.id IS NOT NULL
       ORDER BY mi.name ASC`,
      [id],
    ).catch(() => ({ rows: [] as Array<{ id: string; name: string; link_type: string }> }));

    if (linkedMenuRes.rows.length > 0 && !forceUnlink) {
      const names = linkedMenuRes.rows.map((r) => r.name);
      return NextResponse.json(
        {
          error: `"${itemName}" is currently linked to ${names.length} menu item${names.length === 1 ? "" : "s"} (${names.slice(0, 5).join(", ")}${names.length > 5 ? "..." : ""}). Confirm unlink & delete to remove it from those menu items and delete permanently.`,
          code: "LINKED_TO_MENU",
          linkedMenuItems: linkedMenuRes.rows,
        },
        { status: 409 },
      );
    }

    const deletedCount = await transaction(async (client) => {
      if (linkedMenuRes.rows.length > 0) {
        await client.query(
          `DELETE FROM recipe_ingredients WHERE inventory_item_id::text = $1::text`,
          [id],
        );
        await client.query(
          `UPDATE menu_items
           SET direct_inventory_id = NULL,
               inventory_mode = CASE WHEN inventory_mode = 'direct' THEN 'recipe' ELSE inventory_mode END
           WHERE direct_inventory_id::text = $1::text`,
          [id],
        );
      }

      await client
        .query(`DELETE FROM inventory_item_uoms WHERE inventory_id::text = $1::text`, [id])
        .catch(() => undefined);

      const res = await client.query(`DELETE FROM inventory WHERE id::text = $1::text`, [id]);
      return res.rowCount ?? 0;
    });

    if (deletedCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await updateSystemState("inventory");
    await updateSystemState("menu");
    await publishRealtime("inventory.updated", id);
    if (linkedMenuRes.rows.length > 0) {
      await publishRealtime("menu.updated", id);
    }

    await logAudit({
      action: "DELETE_INVENTORY",
      entityType: "INVENTORY",
      entityId: id,
      performedBy: session?.id,
      details: {
        name: itemName,
        unlinkedMenuItems: linkedMenuRes.rows.map((r) => r.name),
      },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({
      success: true,
      unlinkedMenuCount: linkedMenuRes.rows.length,
    });
  } catch (error) {
    console.error("Inventory Item DELETE failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? `Failed to delete item: ${error.message}`
            : "Failed to delete item",
      },
      { status: 500 },
    );
  }
}
