import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateSystemState } from "@/lib/system-sync";
import { isInventoryUnit, validateInventoryNumber } from "@/lib/inventory-validation";

export async function GET() {
  try {
    const res = await query(`SELECT i.*, mi.name as menu_item_name, mi.barcode as menu_item_barcode FROM inventory i LEFT JOIN menu_items mi ON mi.id = i.menu_item_id ORDER BY i.last_updated DESC`);
    return NextResponse.json(res.rows.map((r: Record<string, unknown>) => ({ id: r.id, name: r.menu_item_name ?? r.name ?? "", sku: r.menu_item_barcode ?? r.sku ?? "", category: r.category ?? "ingredient", quantity: String(r.quantity), unit: r.unit ?? "units", containerUnit: r.container_unit ?? "", quantityPerContainer: String(r.quantity_per_container ?? 1), containerCount: String(r.container_count ?? 0), costPerContainer: String(r.cost_per_container ?? 0), costPerItem: String(r.cost_per_item ?? 0), reorderLevel: String(r.reorder_level ?? 0), cost: String(r.cost_price ?? 0), supplier: r.supplier ?? "", lastUpdated: r.last_updated ?? undefined, menuItemId: r.menu_item_id ?? undefined })));
  } catch (error) {
    console.error("Inventory GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json();
    const { menuItemId, quantity, unit, reorderLevel, cost, supplier, name, sku, category, containerUnit, quantityPerContainer, containerCount, costPerContainer, costPerItem } = body;
    for (const [field, value] of Object.entries({ quantity, reorderLevel, cost })) {
      const error = validateInventoryNumber(value, field);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    if (unit && !isInventoryUnit(String(unit))) return NextResponse.json({ error: "Invalid inventory unit" }, { status: 400 });
    if (containerUnit && !isInventoryUnit(String(containerUnit))) return NextResponse.json({ error: "Invalid container unit" }, { status: 400 });
    for (const [field, value] of Object.entries({ quantityPerContainer, containerCount, costPerContainer, costPerItem })) {
      const error = validateInventoryNumber(value, field);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }
    const normalizedQuantity = quantityPerContainer && containerCount ? Number(quantityPerContainer) * Number(containerCount) : Number(quantity ?? 0);
    const normalizedCostPerItem = costPerContainer && quantityPerContainer ? Number(costPerContainer) / Number(quantityPerContainer) : Number(costPerItem ?? 0);
    let res;
    if (menuItemId) {
      res = await query(`INSERT INTO inventory (menu_item_id, quantity, unit, reorder_level, cost_price, supplier, last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (menu_item_id) DO UPDATE SET quantity=EXCLUDED.quantity, unit=EXCLUDED.unit, reorder_level=EXCLUDED.reorder_level, cost_price=EXCLUDED.cost_price, supplier=EXCLUDED.supplier, container_unit=EXCLUDED.container_unit, quantity_per_container=EXCLUDED.quantity_per_container, container_count=EXCLUDED.container_count, cost_per_container=EXCLUDED.cost_per_container, cost_per_item=EXCLUDED.cost_per_item, last_updated=NOW() RETURNING id`, [menuItemId, normalizedQuantity, unit ?? "units", reorderLevel ?? 0, cost ?? 0, supplier ?? null, containerUnit ?? null, quantityPerContainer ?? 1, containerCount ?? 0, costPerContainer ?? 0, normalizedCostPerItem]);
    } else {
      if (!String(name ?? "").trim()) return NextResponse.json({ error: "Name is required for standalone inventory items" }, { status: 400 });
      res = await query(`INSERT INTO inventory (name, sku, category, quantity, unit, reorder_level, cost_price, supplier, last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING id`, [String(name).trim(), sku ?? "", category ?? "ingredient", normalizedQuantity, unit ?? "units", reorderLevel ?? 0, cost ?? 0, supplier ?? null, containerUnit ?? null, quantityPerContainer ?? 1, containerCount ?? 0, costPerContainer ?? 0, normalizedCostPerItem]);
    }
    await logAudit({ performedBy: session?.id, action: "UPDATE_INVENTORY", entityType: "INVENTORY", entityId: res.rows[0].id, details: body, ipAddress: req.headers.get("x-forwarded-for") || "unknown" });
    await updateSystemState("inventory");
    return NextResponse.json({ id: res.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Inventory POST failed:", error);
    return NextResponse.json({ error: "Failed to upsert inventory" }, { status: 500 });
  }
}
