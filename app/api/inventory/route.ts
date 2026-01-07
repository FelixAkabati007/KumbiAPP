import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const res = await query<
      {
        id: string;
        menu_item_id: string;
        quantity: string;
        unit: string | null;
        reorder_level: string | null;
        cost_price: string | null;
        supplier: string | null;
        last_updated: string | null;
        name: string | null;
        barcode: string | null;
      }
    >(
      `
      SELECT i.*, mi.name, mi.barcode
      FROM inventory i
      LEFT JOIN menu_items mi ON mi.id = i.menu_item_id
      ORDER BY i.last_updated DESC
      `,
    );
    const items = res.rows.map((r) => ({
      id: r.id,
      name: r.name ?? "",
      sku: r.barcode ?? "",
      category: "ingredient" as const,
      quantity: String(r.quantity),
      unit: r.unit ?? "units",
      reorderLevel: String(r.reorder_level ?? 0),
      cost: String(r.cost_price ?? 0),
      supplier: r.supplier ?? "",
      lastUpdated: r.last_updated ?? undefined,
      menuItemId: r.menu_item_id,
    }));
    return NextResponse.json(items);
  } catch (error) {
    console.error("Inventory GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      menuItemId,
      quantity,
      unit,
      reorderLevel,
      cost,
      supplier,
    } = body;
    if (!menuItemId) {
      return NextResponse.json({ error: "menuItemId required" }, { status: 400 });
    }
    const res = await query<{ id: string }>(
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
      ],
    );
    return NextResponse.json({ id: res.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Inventory POST failed:", error);
    return NextResponse.json({ error: "Failed to upsert inventory" }, { status: 500 });
  }
}
