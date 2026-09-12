import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateSystemState } from "@/lib/system-sync";
import { publishRealtime } from "@/lib/realtime";

async function ensureCategory(slug: string): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM categories WHERE slug = $1`,
    [slug]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const name = slug.charAt(0).toUpperCase() + slug.slice(1);
  const created = await query<{ id: string }>(
    `INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id`,
    [name, slug]
  );
  return created.rows[0].id;
}

export async function GET() {
  try {
    const res = await query<{
      id: string;
      name: string;
      description: string | null;
      price: string;
      barcode: string | null;
      is_available: boolean;
      image_url: string | null;
      category_slug: string | null;
      recipe_count: string;
      unavailable_ingredients: string[] | null;
      inventory_mode: "recipe" | "direct";
      direct_inventory_id: string | null;
      direct_units_per_sale: string;
      direct_inventory_quantity: string | null;
      direct_inventory_category: string | null;
    }>(
      `
      SELECT mi.id, mi.name, mi.description, mi.price, mi.barcode, mi.is_available,
             mi.image_url, c.slug AS category_slug, mi.inventory_mode, mi.direct_inventory_id, mi.direct_units_per_sale,
             di.quantity::text AS direct_inventory_quantity, di.category AS direct_inventory_category,
             COUNT(ri.id)::text AS recipe_count,
             ARRAY_REMOVE(ARRAY_AGG(CASE WHEN ri.id IS NOT NULL AND COALESCE(i.quantity, 0) < ri.quantity THEN i.name END), NULL) AS unavailable_ingredients
      FROM menu_items mi
      LEFT JOIN categories c ON mi.category_id = c.id
      LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = mi.id
      LEFT JOIN inventory i ON i.id = ri.inventory_item_id
      LEFT JOIN inventory di ON di.id = mi.direct_inventory_id
      GROUP BY mi.id, c.slug, mi.inventory_mode, mi.direct_inventory_id, mi.direct_units_per_sale, di.quantity, di.category
      ORDER BY mi.created_at DESC
      `
    );

    const items = res.rows.map((r) => ({
      id: r.id,
      isAvailable: r.is_available,
      name: r.name,
      description: r.description ?? "",
      price: Number(r.price),
      barcode: r.barcode ?? undefined,
      inventoryMode: r.inventory_mode,
      directInventoryId: r.direct_inventory_id ?? undefined,
      directUnitsPerSale: Number(r.direct_units_per_sale),
      directInventoryQuantity: r.direct_inventory_quantity == null ? undefined : Number(r.direct_inventory_quantity),
      inStock: r.inventory_mode === "direct" ? r.is_available && Number(r.direct_inventory_quantity ?? 0) >= Number(r.direct_units_per_sale) : r.recipe_count !== "0" && r.unavailable_ingredients?.length === 0 && r.is_available,
      stockStatus: r.inventory_mode === "direct" ? (!r.is_available ? "manually_unavailable" : Number(r.direct_inventory_quantity ?? 0) < Number(r.direct_units_per_sale) ? "out_of_stock" : "available") : r.recipe_count === "0" ? "recipe_required" : r.unavailable_ingredients?.length ? "out_of_stock" : r.is_available ? "available" : "manually_unavailable",
      stockShortages: r.unavailable_ingredients ?? [],
      image: r.image_url ?? undefined,
      category: (r.category_slug || "ghanaian") as
        | "ghanaian"
        | "continental"
        | "beverages"
        | "desserts"
        | "sides",
    }));
    return NextResponse.json(items);
  } catch (error) {
    console.error("Menu GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch menu" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, price, category, barcode, image, inventoryMode = "recipe", directInventoryId = null, directUnitsPerSale = 1 } = body;
    if (!["recipe", "direct"].includes(inventoryMode) || (inventoryMode === "direct" && !directInventoryId)) {
      return NextResponse.json({ error: "Direct-stock items require an inventory item" }, { status: 400 });
    }

    if (!name || typeof price !== "number" || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const categoryId = await ensureCategory(category);
    const result = await query<{ id: string }>(
      `
      INSERT INTO menu_items
        (name, description, price, category_id, image_url, barcode, is_available, inventory_mode, direct_inventory_id, direct_units_per_sale)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
      `,
      [
        name,
        description ?? null,
        price,
        categoryId,
        image?.trim() || null,
        barcode?.trim() || null,
        true,
        inventoryMode,
        directInventoryId,
        directUnitsPerSale,
      ]
    );

    await logAudit({
      performedBy: session?.id,
      action: "CREATE_MENU_ITEM",
      entityType: "MENU",
      entityId: result.rows[0].id,
      details: body,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    await updateSystemState("menu");
    await publishRealtime("menu.updated", result.rows[0].id);

    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Menu POST failed:", error);
    return NextResponse.json(
      { error: "Failed to create menu item" },
      { status: 500 }
    );
  }
}
