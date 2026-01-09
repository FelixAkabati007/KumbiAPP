import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await query(
      `SELECT r.id, r.inventory_item_id, r.quantity, r.unit, i.name as inventory_name 
       FROM recipe_ingredients r
       JOIN inventory i ON r.inventory_item_id = i.id
       WHERE r.menu_item_id = $1`,
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
  const body = await request.json();
  const { inventory_item_id, quantity, unit } = body;

  try {
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
