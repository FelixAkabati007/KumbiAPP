import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { error } = await requirePermission("menu");
    if (error) return error;

    const result = await query(
      `WITH linked_items AS (
         SELECT r.id, r.inventory_item_id, r.quantity, r.unit, i.name AS inventory_name, i.category AS inventory_category,
                i.quantity AS inventory_quantity, i.unit AS inventory_unit,
                CASE
                  WHEN r.unit IN ('g', 'kg', 'oz', 'lb') AND i.unit IN ('g', 'kg', 'oz', 'lb') AND
                    COALESCE(i.quantity, 0) * CASE i.unit WHEN 'kg' THEN 1000 WHEN 'lb' THEN 453.592 WHEN 'oz' THEN 28.3495 ELSE 1 END >=
                    r.quantity * CASE r.unit WHEN 'kg' THEN 1000 WHEN 'lb' THEN 453.592 WHEN 'oz' THEN 28.3495 ELSE 1 END THEN 'stocked'
                  WHEN r.unit IN ('ml', 'l', 'fl_oz', 'gal', 'qt') AND i.unit IN ('ml', 'l', 'fl_oz', 'gal', 'qt') AND
                    COALESCE(i.quantity, 0) * CASE i.unit WHEN 'l' THEN 1000 WHEN 'fl_oz' THEN 29.5735 WHEN 'gal' THEN 3785.41 WHEN 'qt' THEN 946.353 ELSE 1 END >=
                    r.quantity * CASE r.unit WHEN 'l' THEN 1000 WHEN 'fl_oz' THEN 29.5735 WHEN 'gal' THEN 3785.41 WHEN 'qt' THEN 946.353 ELSE 1 END THEN 'stocked'
                  WHEN r.unit IN ('g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'gal', 'qt') OR i.unit IN ('g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'gal', 'qt') THEN 'out_of_stock'
                  WHEN COALESCE(i.quantity, 0) >= r.quantity THEN 'stocked'
                  ELSE 'out_of_stock'
                END AS stock_status
         FROM recipe_ingredients r
         JOIN inventory i ON r.inventory_item_id = i.id
         WHERE r.menu_item_id = $1
       )
       SELECT * FROM linked_items`,
      [id]
    );
    return NextResponse.json(result.rows);
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
    const { error } = await requirePermission("menu");
    if (error) return error;

    const body = await request.json();
    const { inventory_item_id, quantity, unit } = body;
    const allowedUnits = new Set([
      "cs", "bx", "pk", "bg", "flat", "crate", "tub", "drum", "bbl", "sleeve", "carton", "sack", "bottle", "tin", "tray",
      "ea", "ct", "dz", "lb", "oz", "kg", "g", "gal", "qt", "l", "btl", "can", "item", "piece", "unit", "bulb", "clove", "knob", "bunch", "head", "leaf", "root",
      "fl_oz", "ml", "scoop", "ladle", "slice", "pc", "tsp", "tbsp", "c", "pinch",
    ]);
    if (typeof unit !== "string" || !unit.trim() || !allowedUnits.has(unit)) {
      return NextResponse.json({ error: "Select a valid recipe unit." }, { status: 400 });
    }
    if (!inventory_item_id || typeof inventory_item_id !== "string") {
      return NextResponse.json({ error: "Select an inventory ingredient." }, { status: 400 });
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than zero." }, { status: 400 });
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
    const { error } = await requirePermission("menu");
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
