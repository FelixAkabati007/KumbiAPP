
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      quantity,
      unit,
      reorderLevel,
      cost,
      supplier,
    } = body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (quantity !== undefined) { fields.push(`quantity = $${idx++}`); values.push(quantity); }
    if (unit !== undefined) { fields.push(`unit = $${idx++}`); values.push(unit); }
    if (reorderLevel !== undefined) { fields.push(`reorder_level = $${idx++}`); values.push(reorderLevel); }
    if (cost !== undefined) { fields.push(`cost_price = $${idx++}`); values.push(cost); }
    if (supplier !== undefined) { fields.push(`supplier = $${idx++}`); values.push(supplier); }

    if (fields.length === 0) {
      return NextResponse.json({ message: "No changes" });
    }

    // Always update last_updated
    fields.push(`last_updated = NOW()`);

    values.push(id);
    const q = `UPDATE inventory SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id`;

    const res = await query(q, values);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Inventory Item PUT failed:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await query("DELETE FROM inventory WHERE id = $1", [id]);
    
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Inventory Item DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
