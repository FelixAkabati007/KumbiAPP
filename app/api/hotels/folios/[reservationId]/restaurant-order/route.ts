import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { transaction } from "@/lib/db";

const paramsSchema = z.object({ reservationId: z.string().uuid() });
const orderSchema = z.object({
  items: z.array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().positive().max(99) })).min(1),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string }> }
) {
  try {
    const { error: authError } = await requirePermission("guestFolio");
    if (authError) return authError;

    const params = paramsSchema.safeParse(await context.params);
    const body = orderSchema.safeParse(await request.json());
    if (!params.success || !body.success) {
      return NextResponse.json({ error: "Invalid reservation or order items" }, { status: 400 });
    }

    const result = await transaction(async (client) => {
      const menuResult = await client.query(
        `SELECT mi.id, mi.name, mi.price, c.slug AS category_slug
         FROM menu_items mi
         LEFT JOIN categories c ON c.id = mi.category_id
         WHERE mi.id = ANY($1::uuid[]) AND mi.is_available = TRUE`,
        [body.data.items.map((item) => item.menuItemId)]
      );
      const menuById = new Map(menuResult.rows.map((item) => [item.id, item]));
      const selected = body.data.items.map((item) => {
        const menuItem = menuById.get(item.menuItemId);
        if (!menuItem) throw new Error("One or more menu items are no longer available");
        return { ...item, menuItem };
      });

      const folioResult = await client.query(
        `SELECT gf.id, r.reservation_number, g.first_name, g.last_name, rm.room_number
         FROM guest_folios gf
         JOIN reservations r ON r.id = gf.reservation_id
         JOIN guests g ON g.id = r.guest_id
         LEFT JOIN rooms rm ON rm.id = r.room_id
         WHERE gf.reservation_id = $1 FOR UPDATE`,
        [params.data.reservationId]
      );
      const folio = folioResult.rows[0];
      if (!folio) throw new Error("Folio not found");

      const total = selected.reduce((sum, item) => sum + Number(item.menuItem.price) * item.quantity, 0);
      const orderNumber = `FO-${Date.now().toString(36).toUpperCase()}`;
      const customerName = `${folio.first_name} ${folio.last_name}`;
      const orderItems = selected.map((item) => ({
        name: item.menuItem.name,
        price: Number(item.menuItem.price),
        quantity: item.quantity,
        category: item.menuItem.category_slug || "food",
      }));

      const orderResult = await client.query(
        `INSERT INTO kitchenorders
          (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, priority, estimatedtime, status, items)
         VALUES ($1, $2, 'room-service', $3, $4, 'guest-folio', 'normal', NULL, 'pending', $5::jsonb)
         RETURNING id, ordernumber`,
        [orderNumber, total.toFixed(2), folio.room_number, customerName, JSON.stringify(orderItems)]
      );
      const orderId = orderResult.rows[0].id;

      for (const item of selected) {
        await client.query(
          `INSERT INTO kitchen_orderitems
            (kitchenorderid, name, price, category, quantity, status, preptime, notes)
           VALUES ($1, $2, $3, $4, $5, 'pending', NULL, $6)`,
          [orderId, item.menuItem.name, item.menuItem.price, item.menuItem.category_slug || "food", item.quantity, `Room ${folio.room_number || "N/A"} · Guest folio`]
        );
      }

      await client.query(
        `INSERT INTO guest_folio_items
          (reservation_id, folio_id, category, description, quantity, unit_amount, total_amount, source_type, source_id)
         VALUES ($1, $2, 'food', $3, 1, $4, $4, 'restaurant_order', $5)`,
        [params.data.reservationId, folio.id, `Restaurant order ${orderNumber}`, total.toFixed(2), orderId]
      );
      const updatedFolio = await client.query(
        `UPDATE guest_folios
         SET food_charges = COALESCE(food_charges, 0) + $1,
             total_charges = COALESCE(room_charge, 0) + COALESCE(service_charges, 0) + COALESCE(food_charges, 0) + $1 + COALESCE(other_charges, 0),
             balance = GREATEST(0, COALESCE(room_charge, 0) + COALESCE(service_charges, 0) + COALESCE(food_charges, 0) + $1 + COALESCE(other_charges, 0) - COALESCE(paid_amount, 0)),
             last_updated = NOW()
         WHERE reservation_id = $2 RETURNING *`,
        [total.toFixed(2), params.data.reservationId]
      );

      return { orderId, orderNumber, total, folio: updatedFolio.rows[0] };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Failed to create restaurant folio order:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create restaurant order" }, { status: 400 });
  }
}
