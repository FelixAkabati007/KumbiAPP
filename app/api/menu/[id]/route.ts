import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { updateSystemState } from "@/lib/system-sync";
import { logAudit } from "@/lib/audit";
import { publishRealtime } from "@/lib/realtime";
import { calculateMenuAvailability } from "@/lib/menu-availability";

interface MenuRow {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  barcode: string | null;
  is_available: boolean;
  availability_mode: "manual" | "automatic";
  image_url: string | null;
  category_slug: string | null;
  inventory_mode: "recipe" | "direct";
  direct_inventory_id: string | null;
  direct_units_per_sale: string;
  direct_inventory_quantity: string | null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await query<MenuRow>(
      `
      SELECT mi.id, mi.name, mi.description, mi.price, mi.barcode, mi.is_available, mi.availability_mode,
             mi.image_url, c.slug AS category_slug, mi.inventory_mode, mi.direct_inventory_id, mi.direct_units_per_sale,
             di.quantity::text AS direct_inventory_quantity
      FROM menu_items mi
      LEFT JOIN inventory di ON di.id = mi.direct_inventory_id
      LEFT JOIN categories c ON mi.category_id = c.id
      WHERE mi.id = $1
      `,
      [id]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const r = res.rows[0];
    const recipeRes = await query<{ name: string; requiredQuantity: number | string; recipeUnit: string | null; availableQuantity: number | string | null; stockUnit: string | null; conversionRatio: number | string | null; densityGPerMl: number | string | null }>(
      `SELECT i.name, ri.quantity AS "requiredQuantity", ri.unit AS "recipeUnit", i.quantity AS "availableQuantity", COALESCE(i.base_unit, i.unit) AS "stockUnit", i.conversion_ratio AS "conversionRatio", i.density_g_per_ml AS "densityGPerMl" FROM recipe_ingredients ri JOIN inventory i ON i.id = ri.inventory_item_id WHERE ri.menu_item_id = $1`,
      [id]
    );
    const availability = calculateMenuAvailability({ inventoryMode: r.inventory_mode, availabilityMode: r.availability_mode, isAvailable: r.is_available, directQuantity: r.direct_inventory_quantity == null ? null : Number(r.direct_inventory_quantity), directUnitsPerSale: Number(r.direct_units_per_sale), ingredients: recipeRes.rows.map((ingredient) => ({ ...ingredient, requiredQuantity: Number(ingredient.requiredQuantity), availableQuantity: ingredient.availableQuantity == null ? null : Number(ingredient.availableQuantity), conversionRatio: ingredient.conversionRatio == null ? null : Number(ingredient.conversionRatio), densityGPerMl: ingredient.densityGPerMl == null ? null : Number(ingredient.densityGPerMl) })) });
    const item = {
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      price: Number(r.price),
      barcode: r.barcode ?? undefined,
      inventoryMode: r.inventory_mode,
      availabilityMode: r.availability_mode,
      directInventoryId: r.direct_inventory_id ?? undefined,
      directUnitsPerSale: Number(r.direct_units_per_sale),
      isAvailable: r.is_available,
      inStock: availability.inStock,
      stockStatus: availability.stockStatus,
      stockShortages: availability.stockShortages,
      shortageDetails: availability.shortageDetails,
      image: r.image_url ?? undefined,
      category: r.category_slug || "ghanaian",
    };

    return NextResponse.json(item);
  } catch (error) {
    console.error("Menu Item GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch item" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, description, price, category, barcode, inStock, isAvailable, availabilityMode, image, inventoryMode, directInventoryId, directUnitsPerSale } = body;
    if (availabilityMode !== undefined && !["manual", "automatic"].includes(availabilityMode)) {
      return NextResponse.json({ error: "Invalid availability mode" }, { status: 400 });
    }
    if (inventoryMode === "direct" && !directInventoryId) {
      return NextResponse.json({ error: "Direct-stock items require an inventory item" }, { status: 400 });
    }
    if (inventoryMode === "direct") {
      const inventoryResult = await query(
        "SELECT id FROM inventory WHERE id = $1",
        [directInventoryId]
      );
      if (inventoryResult.rowCount !== 1) {
        return NextResponse.json({ error: "Selected supply item was not found" }, { status: 400 });
      }
      if (directUnitsPerSale !== undefined && (!Number.isFinite(Number(directUnitsPerSale)) || Number(directUnitsPerSale) <= 0)) {
        return NextResponse.json({ error: "Supply units per sale must be greater than zero" }, { status: 400 });
      }
    }

    // Validate category and get ID
    let categoryId = null;
    if (category) {
      const catRes = await query<{ id: string }>(
        "SELECT id FROM categories WHERE slug = $1",
        [category]
      );
      if (catRes.rows.length > 0) {
        categoryId = catRes.rows[0].id;
      }
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: (string | number | boolean | null | undefined)[] = [];
    let idx = 1;

    if (name) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(description);
    }
    if (price !== undefined) {
      fields.push(`price = $${idx++}`);
      values.push(price);
    }
    if (categoryId) {
      fields.push(`category_id = $${idx++}`);
      values.push(categoryId);
    }
    if (barcode !== undefined) {
      fields.push(`barcode = $${idx++}`);
      values.push(typeof barcode === "string" ? barcode.trim() || null : barcode);
    }
    const manualAvailability = isAvailable !== undefined ? isAvailable : inStock;
    if (manualAvailability !== undefined) {
      fields.push(`is_available = $${idx++}`);
      values.push(Boolean(manualAvailability));
    }
    if (availabilityMode !== undefined) {
      fields.push(`availability_mode = $${idx++}`);
      values.push(availabilityMode);
    }
    if (image !== undefined) {
      fields.push(`image_url = $${idx++}`);
      values.push(image);
    }
    if (inventoryMode !== undefined) {
      fields.push(`inventory_mode = $${idx++}`);
      values.push(inventoryMode);
    }
    if (inventoryMode === "recipe") {
      fields.push(`direct_inventory_id = $${idx++}`);
      values.push(null);
    } else if (directInventoryId !== undefined) {
      fields.push(`direct_inventory_id = $${idx++}`);
      values.push(directInventoryId);
    }
    if (inventoryMode === "recipe") {
      fields.push(`direct_units_per_sale = 1`);
    } else if (directUnitsPerSale !== undefined) {
      fields.push(`direct_units_per_sale = $${idx++}`);
      values.push(directUnitsPerSale);
    }

    if (fields.length === 0) {
      return NextResponse.json({ message: "No changes" });
    }

    values.push(id);
    const q = `UPDATE menu_items SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id`;

    const res = await query(q, values);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await logAudit({
      performedBy: session.id,
      action: "UPDATE_MENU_ITEM",
      entityType: "MENU",
      entityId: id,
      details: body,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    await updateSystemState("menu");
    await publishRealtime("menu.updated", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Menu Item PUT failed:", error);
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
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const res = await query("DELETE FROM menu_items WHERE id = $1", [id]);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await logAudit({
      performedBy: session.id,
      action: "DELETE_MENU_ITEM",
      entityType: "MENU",
      entityId: id,
      details: { id },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    await updateSystemState("menu");
    await publishRealtime("menu.updated", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Menu Item DELETE failed:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
