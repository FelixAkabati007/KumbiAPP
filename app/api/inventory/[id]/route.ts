import { NextResponse } from "next/server";
import { query } from "@/lib/db";
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
    } = body;
    for (const [value, field] of [
      [quantity, "Quantity"],
      [reorderLevel, "Reorder level"],
      [cost, "Cost"],
      [quantityPerContainer, "Quantity per container"],
      [containerCount, "Container count"],
      [costPerContainer, "Cost per container"],
      [densityGPerMl, "Density"],
      [conversionRatio, "Conversion ratio"],
    ] as const) {
      const validationError = validateInventoryNumber(value, field);
      if (validationError)
        return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const normalizedContainerUnit = containerUnit === "" ? null : containerUnit;
    const normalizedBaseUnit = baseUnit === "" ? null : baseUnit;
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
    const normalizedConversionRatio =
      conversionRatio === "" ? null : conversionRatio;

    const beforeResult = await query(
      "SELECT id, name, sku, category, quantity, unit, supplier, cost_price, cost_per_container, quantity_per_container, cost_per_item FROM inventory WHERE id = $1",
      [id],
    );
    const before = beforeResult.rows[0];
    if (!before)
      return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const effectiveUnit = unit === undefined ? before.unit : unit;
    const effectiveRecipeUnit =
      recipeUnit === undefined ? before.recipe_unit : recipeUnit;
    const unitCompatibilityError =
      effectiveRecipeUnit && effectiveUnit
        ? getInventoryUnitCompatibilityError(
            normalizeInventoryUnit(String(effectiveRecipeUnit)),
            normalizeInventoryUnit(String(effectiveUnit)),
            densityGPerMl === undefined
              ? Number(before.density_g_per_ml ?? 0) || null
              : Number(densityGPerMl) || null,
          )
        : null;
    if (unitCompatibilityError)
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

    const fields: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let idx = 1;

    if (quantity !== undefined) {
      fields.push(`quantity = $${idx++}`);
      values.push(quantity);
    }
    if (unit !== undefined) {
      fields.push(`unit = $${idx++}`);
      values.push(unit);
    }
    if (reorderLevel !== undefined) {
      fields.push(`reorder_level = $${idx++}`);
      values.push(reorderLevel);
    }
    if (cost !== undefined) {
      fields.push(`cost_price = $${idx++}`);
      values.push(cost);
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

    const res = await query(q, values);

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

    return NextResponse.json({ success: true, item: res.rows[0] });
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
    const access = await requireRole("admin");
    if (access.error) return access.error;
    const session = access.session;
    const { id } = await params;

    const res = await query("DELETE FROM inventory WHERE id = $1", [id]);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await updateSystemState("menu");
    await publishRealtime("inventory.updated", id);

    await logAudit({
      action: "DELETE_INVENTORY",
      entityType: "INVENTORY",
      entityId: id,
      performedBy: session?.id,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Inventory Item DELETE failed:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 },
    );
  }
}
