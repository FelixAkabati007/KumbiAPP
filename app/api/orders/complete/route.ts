import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";
import { getRecipeDeductionQuantity } from "@/lib/inventory-units";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItem = { id?: string; name: string; price: number; category?: string; quantity: number; notes?: string; prepTime?: number; discountPercent?: number };

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
    for (const item of items) {
      if (!Number.isFinite(Number(item.price)) || Number(item.price) < 0 || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
        return NextResponse.json({ error: "Invalid order item pricing or quantity" }, { status: 400 });
      }
      if (!Number.isFinite(Number(item.discountPercent ?? 0)) || Number(item.discountPercent ?? 0) < 0 || Number(item.discountPercent ?? 0) > 100) {
        return NextResponse.json({ error: "Discount must be between 0 and 100 percent" }, { status: 400 });
      }
    }
    const pricedItems = items.map((item) => ({ ...item, discountPercent: Number(item.discountPercent ?? 0), price: Number(item.price) * (1 - Number(item.discountPercent ?? 0) / 100) }));
    const computedTotal = pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (Math.abs(computedTotal - Number(total)) > 0.01) {
      return NextResponse.json({ error: "Order total does not match discounted line items" }, { status: 400 });
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
      for (const item of pricedItems) {
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

      for (const item of pricedItems) {
        await client.query(
          `INSERT INTO kitchen_orderitems (kitchenorderid, name, price, category, quantity, status, preptime, notes)
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
  [orderId, item.name, item.price, item.category || "other", item.quantity, item.prepTime || 0, item.notes || null]
  );
  if (item.discountPercent > 0) {
    const originalUnitPrice = item.price / (1 - item.discountPercent / 100);
    await client.query(
      `INSERT INTO discount_applications (order_id, item_name, original_unit_price, discounted_unit_price, discount_percent, quantity, applied_by, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId, item.name, originalUnitPrice, item.price, item.discountPercent, item.quantity, session.id, "POS item discount"],
    );
  }
  const row = byId.get(String(item.id));
        if (row?.inventory_mode === "direct" && row.direct_inventory_id) {
          const deduction = Number(row.direct_units_per_sale || 1) * Number(item.quantity);
          const updated = await client.query(`UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1`, [deduction, row.direct_inventory_id]);
          if (updated.rowCount !== 1) throw new Error(`${item.name} is out of stock`);
          await client.query(
            `INSERT INTO inventory_movements (inventory_id, menu_item_id, quantity_delta, movement_type, source_type, source_id, order_id, reason, actor_id)
             VALUES ($1, $2, $3, 'sale', 'pos_order', $4, $5, $6, $7)`,
            [row.direct_inventory_id, item.id, -deduction, orderNumber, orderId, `Direct sale deduction for ${item.name}`, session.id]
          );
        } else if (item.id) {
const ingredients = await client.query(
        `SELECT r.inventory_item_id, r.quantity, r.unit, i.quantity AS inventory_quantity, i.unit AS inventory_unit, i.recipe_unit AS inventory_recipe_unit, i.conversion_ratio AS inventory_conversion_ratio, i.conversion_type AS inventory_conversion_type, i.density_g_per_ml AS inventory_density, i.name
      FROM recipe_ingredients r
      JOIN inventory i ON i.id = r.inventory_item_id
      WHERE r.menu_item_id = $1`,
            [item.id]
          );
          for (const ingredient of ingredients.rows) {
            const requiredQuantity = Number(ingredient.quantity) * Number(item.quantity);
            const density = ingredient.inventory_density !== null && ingredient.inventory_density !== undefined ? Number(ingredient.inventory_density) : null;
            const deduction = getRecipeDeductionQuantity(requiredQuantity, ingredient.unit, ingredient.inventory_unit, ingredient.inventory_conversion_ratio, density);
            if (deduction === null) {
              throw new Error(`${ingredient.name} uses incompatible units (${ingredient.unit} and ${ingredient.inventory_unit}); configure a compatible unit or density before selling ${item.name}`);
            }
            const updated = await client.query(
              `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1`,
              [deduction, ingredient.inventory_item_id]
            );
            if (updated.rowCount !== 1) throw new Error(`${item.name} is out of stock: ${ingredient.name}`);
            await client.query(
              `INSERT INTO inventory_movements (inventory_id, menu_item_id, quantity_delta, movement_type, source_type, source_id, order_id, reason, actor_id)
               VALUES ($1, $2, $3, 'sale', 'pos_order', $4, $5, $6, $7)`,
              [ingredient.inventory_item_id, item.id, -deduction, orderNumber, orderId, `Recipe deduction for ${item.name}`, session.id]
            );
          }
        }
      }

      const finance = await client.query("SELECT id FROM transactions WHERE transaction_reference = $1 LIMIT 1", [orderNumber]);
      if (!finance.rowCount) {
        await client.query(
          `INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by)
           VALUES (NULL,$1,$2,'GHS',$3,'completed',$4,$5)`,
          [orderNumber, computedTotal, paymentMethod, JSON.stringify({ source: "pos-order-completion", department: "restaurant", departmentLabel: "Restaurant", orderNumber, orderType, tableNumber: tableNumber || undefined, customerName: customerName || undefined, customerRefused: !customerName, items: pricedItems, discounts: pricedItems.filter((item) => item.discountPercent > 0).map((item) => ({ itemId: item.id, itemName: item.name, discountPercent: item.discountPercent, originalUnitPrice: Number(item.price) / (1 - item.discountPercent / 100), discountedUnitPrice: item.price, quantity: item.quantity })), kitchenOrderId: orderId, performedBy: { id: session.id, accountName: session.name, name: session.name, email: session.email, role: session.role } }), session.id]
        );
      }
      await recordFinancialLedgerEntry(client, {
        eventKey: `pos-order:${orderNumber}`,
        amount: Number(total),
        direction: "credit",
        status: "posted",
        source: "pos-order-completion",
        paymentMethod,
        entityType: "restaurant_order",
        entityId: String(orderId),
        metadata: {
          department: "restaurant",
          departmentLabel: "Restaurant",
          orderNumber,
          orderType,
          tableNumber: tableNumber || null,
          customerName: customerName || null,
          kitchenOrderId: orderId,
          items,
          performedBy: { id: session.id, accountName: session.name, name: session.name, email: session.email, role: session.role },
        },
      });
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
