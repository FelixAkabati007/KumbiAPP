
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await query<any>(
      `
      SELECT mi.id, mi.name, mi.description, mi.price, mi.barcode, mi.is_available,
             mi.image_url, c.slug AS category_slug
      FROM menu_items mi
      LEFT JOIN categories c ON mi.category_id = c.id
      WHERE mi.id = $1
      `,
      [id]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const r = res.rows[0];
    const item = {
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      price: Number(r.price),
      barcode: r.barcode ?? undefined,
      inStock: r.is_available,
      image: r.image_url ?? undefined,
      category: r.category_slug || "ghanaian",
    };

    return NextResponse.json(item);
  } catch (error) {
    console.error("Menu Item GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      description,
      price,
      category,
      barcode,
      inStock,
      image,
    } = body;

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
    const values: any[] = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (price !== undefined) { fields.push(`price = $${idx++}`); values.push(price); }
    if (categoryId) { fields.push(`category_id = $${idx++}`); values.push(categoryId); }
    if (barcode !== undefined) { fields.push(`barcode = $${idx++}`); values.push(barcode); }
    if (inStock !== undefined) { fields.push(`is_available = $${idx++}`); values.push(inStock); }
    if (image !== undefined) { fields.push(`image_url = $${idx++}`); values.push(image); }

    if (fields.length === 0) {
      return NextResponse.json({ message: "No changes" });
    }

    values.push(id);
    const q = `UPDATE menu_items SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id`;

    const res = await query(q, values);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Menu Item PUT failed:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await query("DELETE FROM menu_items WHERE id = $1", [id]);
    
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Menu Item DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
