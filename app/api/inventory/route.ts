import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateSystemState } from "@/lib/system-sync";

export async function GET() {
  try {
    const res = await query<{
      id: string;
      menu_item_id: string | null;
      quantity: string;
      unit: string | null;
      reorder_level: string | null;
      cost_price: string | null;
      supplier: string | null;
      last_updated: string | null;
      name: string | null;
      sku: string | null;
      category: string | null;
      menu_item_name: string | null;
      menu_item_barcode: string | null;
    }>(
      `
      SELECT i.*, mi.name as menu_item_name, mi.barcode as menu_item_barcode
      FROM inventory i
      LEFT JOIN menu_items mi ON mi.id = i.menu_item_id
      ORDER BY i.last_updated DESC
      `
    );
    const items = res.rows.map((r) => ({
      id: r.id,
      name: r.menu_item_name ?? r.name ?? "",
      sku: r.menu_item_barcode ?? r.sku ?? "",
      category: (r.category as string) ?? "ingredient",
      quantity: String(r.quantity),
      unit: r.unit ?? "units",
      reorderLevel: String(r.reorder_level ?? 0),
      cost: String(r.cost_price ?? 0),
      supplier: r.supplier ?? "",
      lastUpdated: r.last_updated ?? undefined,
      menuItemId: r.menu_item_id ?? undefined,
    }));
    return NextResponse.json(items);
  } catch (error) {
    console.error("Inventory GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
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
    } = body;

    let res;
    if (menuItemId) {
      res = await query<{ id: string }>(
        `
        INSERT INTO inventory (menu_item_id, quantity, unit, reorder_level, cost_price, supplier, last_updated)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (menu_item_id)
        DO UPDATE SET quantity = EXCLUDED.quantity,
                      unit = EXCLUDED.unit,
                      reorder_level = EXCLUDED.reorder_level,
                      cost_price = EXCLUDED.cost_price,
                      supplier = EXCLUDED.supplier,
                      last_updated = NOW()
        RETURNING id
        `,
        [
          menuItemId,
          quantity ?? 0,
          unit ?? "units",
          reorderLevel ?? 0,
          cost ?? 0,
          supplier ?? null,
        ]
      );
    } else {
      // Standalone inventory item
      if (!name) {
        return NextResponse.json(
          { error: "Name is required for standalone inventory items" },
          { status: 400 }
        );
      }
      res = await query<{ id: string }>(
        `
        INSERT INTO inventory (name, sku, category, quantity, unit, reorder_level, cost_price, supplier, last_updated)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id
        `,
        [
          name,
          sku ?? "",
          category ?? "ingredient",
          quantity ?? 0,
          unit ?? "units",
          reorderLevel ?? 0,
          cost ?? 0,
          supplier ?? null,
        ]
      );
    }

    await logAudit({
      performedBy: session?.id,
      action: "UPDATE_INVENTORY",
      entityType: "INVENTORY",
      entityId: res.rows[0].id,
      details: body,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    await updateSystemState("inventory");

    return NextResponse.json({ id: res.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Inventory POST failed:", error);
    return NextResponse.json(
      { error: "Failed to upsert inventory" },
      { status: 500 }
    );
  }
}
