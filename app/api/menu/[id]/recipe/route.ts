import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, requireRole } from "@/lib/api-auth";
import { getRecipeDeductionQuantity, isInventoryUnit } from "@/lib/inventory-units";
import { calculateInventoryLineCost } from "@/lib/inventory-cost";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { error } = await requirePermission("menu");
    if (error) return error;

    const result = await query(
      `SELECT r.id, r.inventory_item_id, r.quantity, r.unit, i.name AS inventory_name, i.category AS inventory_category,
              i.quantity AS inventory_quantity, i.unit AS inventory_unit, i.recipe_unit AS inventory_recipe_unit, i.conversion_ratio AS inventory_conversion_ratio, i.conversion_type AS inventory_conversion_type, i.density_g_per_ml AS inventory_density, i.cost_per_item AS inventory_cost_price
       FROM recipe_ingredients r
       JOIN inventory i ON r.inventory_item_id = i.id
       WHERE r.menu_item_id = $1`,
      [id]
    );

    // Derive stock status from the same shared unit-conversion logic used when
    // deducting inventory on sale, so Menu Management and Inventory Management
    // always agree on whether an ingredient/supply is truly stocked.
    const rows = result.rows.map((row) => {
      const density = row.inventory_density !== null && row.inventory_density !== undefined ? Number(row.inventory_density) : null;
      const requiredInInventoryUnit = getRecipeDeductionQuantity(Number(row.quantity), row.unit, row.inventory_unit, row.inventory_conversion_ratio, density);
      const availableQuantity = Number(row.inventory_quantity ?? 0);
      const stock_status = requiredInInventoryUnit === null
        ? "unit_mismatch"
        : availableQuantity <= 0
          ? "out_of_stock"
          : availableQuantity < requiredInInventoryUnit
            ? "low_stock"
            : "stocked";
      const cost = calculateInventoryLineCost({
        recipeQuantity: Number(row.quantity), recipeUnit: row.unit, inventoryUnit: row.inventory_unit,
        conversionRatio: row.inventory_conversion_ratio, densityGPerMl: row.inventory_density,
        costPerInventoryUnit: row.inventory_cost_price,
      });
      return {
        ...row,
        stock_status,
        required_inventory_quantity: requiredInInventoryUnit,
        available_inventory_quantity: availableQuantity,
        cost_status: cost.status,
        cost_per_inventory_unit: cost.costPerInventoryUnit,
        line_cost: cost.lineCost,
        cost_reason: cost.reason,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch recipe:", error);
    return NextResponse.json({ error: "Failed to fetch recipe" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { error } = await requireRole("admin", "restaurantManager", "manager", "kitchen");
    if (error) return error;

    const body = await request.json();
    const { inventory_item_id, quantity, unit } = body;
    if (typeof unit !== "string" || !unit.trim() || !isInventoryUnit(unit)) {
      return NextResponse.json({ error: "Select a valid recipe unit." }, { status: 400 });
    }
    if (!inventory_item_id || typeof inventory_item_id !== "string") {
      return NextResponse.json({ error: "Select an inventory ingredient." }, { status: 400 });
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than zero." }, { status: 400 });
    }

  const inventoryResult = await query(
    `SELECT category, recipe_unit, unit, base_unit, conversion_ratio, density_g_per_ml FROM inventory WHERE id = $1`,
    [inventory_item_id]
  );
  const inventory = inventoryResult.rows[0];
  if (!inventory) return NextResponse.json({ error: "Selected inventory item was not found." }, { status: 404 });
  const isSupply = ["supply", "packaging", "disposable", "equipment", "non-food"].includes(String(inventory.category ?? "").toLowerCase());
  if (isSupply && !inventory.recipe_unit) {
    return NextResponse.json({ error: "Configure a recipe unit for this Inventory supply before adding it to a menu." }, { status: 400 });
  }
  if (isSupply && String(unit).toLowerCase() !== String(inventory.recipe_unit).toLowerCase()) {
    return NextResponse.json({ error: `Use the Inventory recipe unit: ${inventory.recipe_unit}.` }, { status: 400 });
  }

  const requiredInInventoryUnit = getRecipeDeductionQuantity(
    Number(quantity),
    unit,
    inventory.unit,
    inventory.conversion_ratio,
    inventory.density_g_per_ml
  );
  if (requiredInInventoryUnit === null) {
    return NextResponse.json({
      error: `Cannot convert ${unit} to the Inventory stock unit ${inventory.unit}. Configure a compatible recipe unit, conversion ratio, or density first.`,
    }, { status: 400 });
  }

  await query(
    `INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, quantity, unit)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (menu_item_id, inventory_item_id) 
       DO UPDATE SET quantity = $3, unit = $4`,
      [id, inventory_item_id, quantity, unit]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save recipe ingredient:", error);
    return NextResponse.json({ error: "Failed to save recipe ingredient" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const inventoryItemId = searchParams.get("inventoryItemId");

  if (!inventoryItemId) {
      return NextResponse.json({ error: "Missing inventoryItemId" }, { status: 400 });
  }

  try {
    const { error } = await requireRole("admin", "restaurantManager", "manager", "kitchen");
    if (error) return error;

    await query(
      `DELETE FROM recipe_ingredients WHERE menu_item_id = $1 AND inventory_item_id = $2`,
      [id, inventoryItemId]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete recipe ingredient:", error);
    return NextResponse.json({ error: "Failed to delete recipe ingredient" }, { status: 500 });
  }
}
