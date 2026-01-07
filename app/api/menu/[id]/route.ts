import { NextResponse } from "next/server";
import { query } from "@/lib/db";

async function ensureCategory(slug: string): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM categories WHERE slug = $1`,
    [slug],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const name = slug.charAt(0).toUpperCase() + slug.slice(1);
  const created = await query<{ id: string }>(
    `INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id`,
    [name, slug],
  );
  return created.rows[0].id;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, price, category, barcode, inStock, image } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(description ?? null);
    }
    if (price !== undefined) {
      updates.push(`price = $${idx++}`);
      values.push(price);
    }
    if (image !== undefined) {
      updates.push(`image_url = $${idx++}`);
      values.push(image ?? null);
    }
    if (barcode !== undefined) {
      updates.push(`barcode = $${idx++}`);
      values.push(barcode ?? null);
    }
    if (inStock !== undefined) {
      updates.push(`is_available = $${idx++}`);
      values.push(!!inStock);
    }
    if (category !== undefined) {
      const categoryId = await ensureCategory(category);
      updates.push(`category_id = $${idx++}`);
      values.push(categoryId);
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "No updates provided" });
    }

    values.push(id);

    const res = await query(
      `UPDATE menu_items SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id`,
      values,
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Menu PUT failed:", error);
    return NextResponse.json({ error: "Failed to update menu item" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const res = await query(`DELETE FROM menu_items WHERE id = $1`, [id]);
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Menu DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete menu item" }, { status: 500 });
  }
}
