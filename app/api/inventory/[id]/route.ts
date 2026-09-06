import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;
    const body = await req.json();
    const { quantity, unit, reorderLevel, cost, supplier, containerUnit, quantityPerContainer, containerCount, costPerContainer, costPerItem } = body;

    const beforeResult = await query(
      "SELECT id, name, sku, category, quantity, unit, supplier, cost_price FROM inventory WHERE id = $1",
      [id]
    );
    const before = beforeResult.rows[0];
    if (!before) return NextResponse.json({ error: "Item not found" }, { status: 404 });

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
    for (const [column, value] of [["container_unit", containerUnit], ["quantity_per_container", quantityPerContainer], ["container_count", containerCount], ["cost_per_container", costPerContainer], ["cost_per_item", costPerItem]] as const) {
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
      ", "
    )} WHERE id = $${idx} RETURNING *`;

    const res = await query(q, values);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const nextQuantity = quantity === undefined ? Number(before.quantity) : Number(quantity);
    if (Number.isFinite(nextQuantity) && nextQuantity > Number(before.quantity)) {
      await logAudit({
        action: "RESTOCK_INVENTORY",
        entityType: "INVENTORY",
        entityId: id,
        details: {
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
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    const res = await query("DELETE FROM inventory WHERE id = $1", [id]);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

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
      { status: 500 }
    );
  }
}
