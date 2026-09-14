import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItem = { id?: string; name: string; price: number; category?: string; quantity: number; notes?: string; prepTime?: number };

export async function POST(req: Request) {
  try {
    const { session, error } = await requirePermission("pos");
    if (error) return error;
    const body = await req.json();
    const { orderNumber, total, orderType = "dine-in", tableNumber, customerName, paymentMethod = "cash", items, priority = "normal", estimatedTime } = body as {
      orderNumber: string; total: number; orderType?: string; tableNumber?: string; customerName?: string; paymentMethod?: string; items: OrderItem[]; priority?: string; estimatedTime?: number;
    };
    if (!orderNumber || !Number.isFinite(Number(total)) || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order number, total, and items are required" }, { status: 400 });
    }

    const result = await transaction(async (client) => {
      const existing = await client.query("SELECT id FROM kitchenorders WHERE ordernumber = $1 LIMIT 1", [orderNumber]);
      if (existing.rowCount) return { id: existing.rows[0].id, idempotent: true };

      const menuIds = items.map((item) => item.id).filter(Boolean);
      const stock = await client.query(
        `SELECT mi.id, mi.inventory_mode, mi.direct_inventory_id, mi.direct_units_per_sale, di.quantity
         FROM menu_items mi LEFT JOIN inventory di ON di.id = mi.direct_inventory_id
         WHERE mi.id = ANY($1::uuid[])`, [menuIds]
      );
      const byId = new Map(stock.rows.map((row) => [String(row.id), row]));
      for (const item of items) {
        const row = byId.get(String(item.id));
        if (row?.inventory_mode === "direct") {
          const required = Number(row.direct_units_per_sale || 1) * Number(item.quantity);
          if (!row.direct_inventory_id || Number(row.quantity) < required) throw new Error(`${item.name} is out of stock`);
        }
      }

      const order = await client.query(
        `INSERT INTO kitchenorders (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, priority, estimatedtime, status, performed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING id`,
        [orderNumber, total, orderType, tableNumber || null, customerName || null, paymentMethod, priority, estimatedTime || null, session.id]
      );
      const orderId = order.rows[0].id;

      for (const item of items) {
        await client.query(
          `INSERT INTO kitchen_orderitems (kitchenorderid, name, price, category, quantity, status, preptime, notes)
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
          [orderId, item.name, item.price, item.category || "other", item.quantity, item.prepTime || 0, item.notes || null]
        );
        const row = byId.get(String(item.id));
        if (row?.inventory_mode === "direct" && row.direct_inventory_id) {
          const deduction = Number(row.direct_units_per_sale || 1) * Number(item.quantity);
          const updated = await client.query(`UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1`, [deduction, row.direct_inventory_id]);
          if (updated.rowCount !== 1) throw new Error(`${item.name} is out of stock`);
        } else if (item.id) {
          const ingredients = await client.query("SELECT inventory_item_id, quantity FROM recipe_ingredients WHERE menu_item_id = $1", [item.id]);
          for (const ingredient of ingredients.rows) {
            await client.query(`UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2`, [Number(ingredient.quantity) * Number(item.quantity), ingredient.inventory_item_id]);
          }
        }
      }

      const finance = await client.query("SELECT id FROM transactions WHERE transaction_reference = $1 LIMIT 1", [orderNumber]);
      if (!finance.rowCount) {
        await client.query(
          `INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by)
           VALUES (NULL,$1,$2,'GHS',$3,'completed',$4,$5)`,
          [orderNumber, total, paymentMethod, JSON.stringify({ source: "pos-order-completion", orderNumber, orderType, tableNumber: tableNumber || undefined, customerName: customerName || undefined, customerRefused: !customerName, items, kitchenOrderId: orderId, performedBy: { id: session.id, name: session.name, email: session.email, role: session.role } }), session.id]
        );
      }
      return { id: orderId, idempotent: false };
    });

    if (!result.idempotent) {
      await publishRealtime("orders.updated", String(result.id));
      await publishRealtime("pos.updated", String(result.id));
      await publishRealtime("inventory.updated", String(result.id));
      await publishRealtime("finance.updated", String(result.id));
    }
    return NextResponse.json({ success: true, orderId: result.id, idempotent: result.idempotent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete order";
    const status = message.toLowerCase().includes("out of stock") ? 409 : 500;
    console.error("Failed to complete POS order:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  const result = await query("SELECT 1");
  return NextResponse.json({ ok: result.rowCount === 1 });
}
