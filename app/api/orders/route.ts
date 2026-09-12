import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { error } = await requirePermission("orderBoard");
    if (error) return error;

    const ordersResult = await query(`
      SELECT
        k.*,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'name', i.name,
              'quantity', i.quantity,
              'status', i.status,
              'price', i.price,
              'category', i.category,
              'notes', i.notes,
              'prepTime', i.preptime,
              'orderId', i.kitchenorderid
            )
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'
        ) as items
      FROM kitchenorders k
      LEFT JOIN kitchen_orderitems i ON k.id = i.kitchenorderid
      WHERE k.kitchen_closed_at IS NULL
      GROUP BY k.id
      ORDER BY k.created_at DESC
    `);

    const orders = ordersResult.rows.map((row) => ({
      id: row.id,
      orderNumber: row.ordernumber,
      total: Number(row.total),
      orderType: row.ordertype,
      tableNumber: row.tablenumber,
      customerName: row.customername,
      paymentMethod: row.paymentmethod,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      estimatedTime: row.estimatedtime,
      notes: row.notes,
      chefNotes: row.chefnotes,
      items: row.items,
    }));

    return NextResponse.json(orders);
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { error } = await requirePermission("pos");
    if (error) return error;

    const body = await req.json();
    // Simple implementation for creating an order
    const {
      orderNumber,
      total,
      orderType,
      tableNumber,
      customerName,
      paymentMethod,
      items,
      priority,
      estimatedTime,
    } = body;

    const menuItemIds = Array.isArray(items) ? items.map((item: { id?: string }) => item.id).filter(Boolean) : [];
    if (menuItemIds.length > 0) {
      const stockResult = await query(
        `SELECT mi.id AS menu_item_id,
                mi.inventory_mode,
                mi.direct_inventory_id,
                mi.direct_units_per_sale,
                di.quantity AS direct_quantity
         FROM menu_items mi
         LEFT JOIN inventory di ON di.id = mi.direct_inventory_id
         WHERE mi.id = ANY($1::uuid[])`,
        [menuItemIds]
      );
      const stockByMenuItem = new Map(stockResult.rows.map((row) => [String(row.menu_item_id), row]));
      const unavailable = (items as Array<{ id?: string; name?: string; quantity?: number }>)
        .find((item) => {
          if (!item.id) return false;
          const stock = stockByMenuItem.get(String(item.id));
          if (!stock) return false;
          const requested = Number(item.quantity ?? 0);
          if (stock.inventory_mode === "direct") {
            return !stock.direct_inventory_id || Number(stock.direct_quantity ?? 0) < Number(stock.direct_units_per_sale ?? 1) * requested;
          }
          return false;
        });
      if (unavailable) {
        return NextResponse.json({ error: `${unavailable.name ?? "Item"} is out of stock` }, { status: 409 });
      }
    }

    const orderResult = await query(
      `INSERT INTO kitchenorders (
        ordernumber, total, ordertype, tablenumber, customername, paymentmethod, priority, estimatedtime, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id`,
      [
        orderNumber,
        total,
        orderType,
        tableNumber,
        customerName,
        paymentMethod,
        priority || "normal",
        estimatedTime,
      ]
    );

    const orderId = orderResult.rows[0].id;

    if (items && items.length > 0) {
      for (const item of items) {
        await query(
          `INSERT INTO kitchen_orderitems (
            kitchenorderid, name, price, category, quantity, status, preptime, notes
          ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
          [
            orderId,
            item.name,
            item.price,
            item.category,
            item.quantity,
            item.prepTime,
            item.notes,
          ]
        );
      }
    }

    await publishRealtime("orders.updated", String(orderId));
    await publishRealtime("pos.updated", String(orderId));
    return NextResponse.json({ success: true, id: orderId });
  } catch (error) {
    console.error("Failed to create order:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
