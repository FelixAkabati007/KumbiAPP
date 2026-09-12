import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const RESTOCK_ROLES = new Set(["admin", "generalManager", "restaurantManager", "chef", "kitchen"]);

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await query(
      "SELECT role, job_classification, position FROM users LEFT JOIN staff_profiles ON staff_profiles.user_id = users.id WHERE users.id = $1 LIMIT 1",
      [session.id],
    );
    const role = profile.rows[0]?.role || profile.rows[0]?.job_classification || profile.rows[0]?.position;
    if (!RESTOCK_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const search = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (search.length < 2) return NextResponse.json({ suggestions: [] });

    const pattern = `%${search}%`;
    const current = await query(
      `SELECT id, name, sku, category, unit, container_unit, quantity_per_container, container_count,
              cost_per_container, cost_per_item, reorder_level, cost_price, supplier, last_updated
       FROM inventory
       WHERE name ILIKE $1 OR sku ILIKE $1
       ORDER BY CASE WHEN name ILIKE $2 THEN 0 WHEN sku ILIKE $2 THEN 1 ELSE 2 END, last_updated DESC
       LIMIT 20`,
      [pattern, `${search}%`],
    );

    const history = await query(
      `SELECT details, created_at
       FROM audit_logs
       WHERE action IN ('UPDATE_INVENTORY', 'RESTOCK_INVENTORY', 'RESTOCK_BASELINE')
         AND entity_type = 'INVENTORY'
         AND (details->>'name' ILIKE $1 OR details->'item'->>'name' ILIKE $1 OR details->>'sku' ILIKE $1 OR details->'item'->>'sku' ILIKE $1)
       ORDER BY created_at DESC
       LIMIT 100`,
      [pattern],
    );

    const suggestions = new Map<string, Record<string, unknown>>();
    for (const row of current.rows) {
      const key = String(row.sku || row.name).toLowerCase();
      suggestions.set(key, {
        source: "current",
        id: row.id,
        name: row.name,
        sku: row.sku ?? "",
        category: row.category ?? "ingredient",
        unit: row.unit ?? "units",
        containerUnit: row.container_unit ?? "",
        quantityPerContainer: String(row.quantity_per_container ?? 1),
        containerCount: String(row.container_count ?? 0),
        costPerContainer: String(row.cost_per_container ?? 0),
        costPerItem: String(row.cost_per_item ?? 0),
        reorderLevel: String(row.reorder_level ?? 0),
        cost: String(row.cost_price ?? 0),
        supplier: row.supplier ?? "",
      });
    }

    for (const row of history.rows) {
      const details = (row.details ?? {}) as Record<string, unknown>;
      const item = (details.item ?? {}) as Record<string, unknown>;
      const merged = { ...details, ...item };
      const name = String(merged.name ?? "").trim();
      const sku = String(merged.sku ?? "").trim();
      if (!name && !sku) continue;
      const key = (sku || name).toLowerCase();
      if (suggestions.has(key)) continue;
      suggestions.set(key, {
        source: "history",
        name,
        sku,
        category: merged.category ?? "ingredient",
        unit: merged.unit ?? "units",
        containerUnit: merged.containerUnit ?? "",
        quantityPerContainer: String(merged.quantityPerContainer ?? 1),
        containerCount: String(merged.containerCount ?? 0),
        costPerContainer: String(merged.costPerContainer ?? 0),
        costPerItem: String(merged.costPerItem ?? 0),
        reorderLevel: String(merged.reorderLevel ?? 0),
        cost: String(merged.cost ?? merged.costPrice ?? 0),
        supplier: merged.supplier ?? "",
      });
    }

    return NextResponse.json({ suggestions: Array.from(suggestions.values()).slice(0, 20) });
  } catch (error) {
    console.error("Inventory suggestions GET failed:", error);
    return NextResponse.json({ error: "Failed to load inventory suggestions" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
