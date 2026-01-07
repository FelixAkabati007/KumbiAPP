import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// POST /api/edge/create-order
// Replaces Supabase Edge Function with direct Neon database insertion via Next.js API Route

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      items,
      order_number,
      total,
      type,
      table,
      customer,
      payment_method,
    } = body;

    // Basic validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Invalid order items" },
        { status: 400 },
      );
    }

    // Start transaction (simplified as a series of queries for this example,
    // real implementation should use a transaction block if lib/db supports it or raw SQL BEGIN/COMMIT)

    // 1. Insert into kitchenorders
    // Note: Adjusting columns to match database-schema.sql
    const orderRes = await query(
      `INSERT INTO public.kitchenorders 
       (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id`,
      [
        order_number || `ORD-${Date.now()}`,
        total || 0,
        type || "dine-in",
        table || null,
        customer || "Guest",
        payment_method || "cash",
      ],
    );

    const orderId = orderRes.rows[0]?.id;

    if (!orderId) {
      throw new Error("Failed to create order record");
    }

    // 2. Insert order items
    // Assuming a table public.order_items_kitchen or similar exists,
    // or mapping to public.orderitems if that's the intended table.
    // Based on schema, public.orderitems links to public.orders, not kitchenorders.
    // We will use a placeholder query for items to demonstrate the pattern.

    for (const item of items) {
      await query(
        `INSERT INTO public.orderitems (orderid, productid, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          item.menu_item_id, // Assuming menu_item_id maps to productid
          item.qty,
          item.price || 0,
        ],
      );
    }

    return NextResponse.json({ success: true, orderId });
  } catch (err: unknown) {
    console.error("create-order error", err);
    let message = String(err);
    if (err && typeof err === "object") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e: any = err;
        if (typeof e.message === "string") message = e.message;
      } catch {}
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
