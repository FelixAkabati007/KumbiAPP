import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { transaction } from "@/lib/db";
import { publishRealtime } from "@/lib/realtime";
import { calculateTaxes, getTaxConfiguration, roundMoney } from "@/lib/tax";
import {
  deductSingleOrderItemInventory,
  lockAndValidateDirectPosStock,
  toSafeUuid,
} from "@/lib/pos-order-inventory";

const paramsSchema = z.object({ reservationId: z.string().uuid() });
const orderSchema = z.object({
  requestId: z.string().min(8).max(120).optional(),
  items: z.array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().positive().max(99) })).min(1),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string }> }
) {
  try {
    const { session, error: authError } = await requirePermission("guestFolio");
    if (authError) return authError;

    const params = paramsSchema.safeParse(await context.params);
    const body = orderSchema.safeParse(await request.json());
    if (!params.success || !body.success) {
      return NextResponse.json({ error: "Invalid reservation or order items" }, { status: 400 });
    }

    const result = await transaction(async (client) => {
      const requestId = body.data.requestId;
      if (requestId) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [requestId]);
        const existing = await client.query(
          `SELECT ko.id, ko.ordernumber, ko.total, gf.*
           FROM kitchenorders ko
           LEFT JOIN guest_folio_items gfi ON gfi.source_id::text = ko.id::text
           LEFT JOIN guest_folios gf ON gf.id = gfi.folio_id
           WHERE ko.ordernumber = $1 LIMIT 1`,
          [requestId]
        );
        if (existing.rowCount) return { orderId: existing.rows[0].id, orderNumber: existing.rows[0].ordernumber, total: Number(existing.rows[0].total), folio: existing.rows[0], idempotent: true };
      }
      const menuResult = await client.query(
        `SELECT mi.id, mi.name, mi.price, mi.barcode, c.slug AS category_slug,
                mi.inventory_mode, mi.direct_inventory_id, mi.direct_units_per_sale
         FROM menu_items mi
         LEFT JOIN categories c ON c.id = mi.category_id
         WHERE mi.id = ANY($1::uuid[]) AND (mi.availability_mode = 'automatic' OR mi.is_available = TRUE)`,
        [body.data.items.map((item) => item.menuItemId)]
      );
      const menuById = new Map(menuResult.rows.map((item) => [item.id, item]));
      const selected = body.data.items.map((item) => {
        const menuItem = menuById.get(item.menuItemId);
        if (!menuItem) throw new Error("One or more menu items are no longer available");
        return { ...item, menuItem };
      });

      const folioResult = await client.query(
        `SELECT id
         FROM guest_folios
         WHERE reservation_id::text = $1::text
         FOR UPDATE`,
        [params.data.reservationId]
      );
      const folio = folioResult.rows[0];
      if (!folio) throw new Error("Folio not found");
      const orderNumberForMovement = requestId || `FO-${Date.now().toString(36).toUpperCase()}`;

      const folioDetailsResult = await client.query(
        `SELECT r.reservation_number, r.status, g.first_name, g.last_name, rm.room_number
         FROM reservations r
         JOIN guests g ON g.id = r.guest_id
         LEFT JOIN rooms rm ON rm.id = r.room_id
         WHERE r.id = $1`,
        [params.data.reservationId]
      );
      const folioDetails = folioDetailsResult.rows[0];
      if (!folioDetails) throw new Error("Reservation not found");
      if (folioDetails.status !== "checked_in") throw new Error("Restaurant orders are only available while the guest is checked in");

      const deductibleItems = selected.map((item) => ({
        id: String(item.menuItem.id),
        name: String(item.menuItem.name),
        quantity: item.quantity,
        barcode: item.menuItem.barcode ? String(item.menuItem.barcode) : undefined,
        unitsPerSale: Number(item.menuItem.direct_units_per_sale ?? 1),
      }));
      const preparedStock = await lockAndValidateDirectPosStock(client, deductibleItems);

      for (const item of deductibleItems) {
        await deductSingleOrderItemInventory(client, item, {
          preparedStock,
          orderNumber: requestId || orderNumberForMovement,
          orderId: String(folio.id),
          actorId: toSafeUuid(session.id),
          sourceType: "hotel_restaurant_order",
        });
      }

      const total = selected.reduce((sum, item) => sum + Number(item.menuItem.price) * item.quantity, 0);
      const taxes = calculateTaxes(total, await getTaxConfiguration(), "rooms");
      const taxedTotal = roundMoney(taxes.total);
      const authorizationResult = await client.query(`SELECT id, status, valid_from, valid_until, folio_waived, approved_amount, COALESCE((SELECT SUM(amount_used) FROM complimentary_authorization_usage WHERE authorization_id = ca.id), 0) AS used_amount FROM complimentary_authorizations ca WHERE ca.reservation_id::text = $1::text AND ca.status = 'active' AND ca.valid_from <= NOW() AND ca.valid_until > NOW() AND ca.folio_waived = true AND ca.scope IN ('restaurant', 'both') ORDER BY ca.created_at DESC LIMIT 1 FOR UPDATE`, [params.data.reservationId]);
      const authorization = authorizationResult.rows[0];
      const isWaived = Boolean(authorization && new Date(authorization.valid_until) > new Date() && Number(authorization.approved_amount) - Number(authorization.used_amount) >= taxedTotal);
      const paidAtOrderTotal = isWaived ? 0 : taxedTotal;
      const orderNumber = orderNumberForMovement;
      const customerName = `${folioDetails.first_name} ${folioDetails.last_name}`;
      const orderItems = selected.map((item) => ({
        name: item.menuItem.name,
        price: Number(item.menuItem.price),
        quantity: item.quantity,
        category: item.menuItem.category_slug || "food",
      }));
      const itemsColumnResult = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kitchenorders' AND column_name = 'items'`
      );
      const hasItemsColumn = (itemsColumnResult.rowCount ?? 0) > 0;
      const orderResult = hasItemsColumn
        ? await client.query(
            `INSERT INTO kitchenorders
              (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, priority, estimatedtime, status, items, performed_by)
             VALUES ($1, $2, 'room-service', $3, $4, 'paid-at-order', 'normal', NULL, 'pending', $5::jsonb, $6)
             RETURNING id, ordernumber`,
            [orderNumber, taxedTotal.toFixed(2), folioDetails.room_number, customerName, JSON.stringify(orderItems), session.id]
          )
        : await client.query(
            `INSERT INTO kitchenorders
              (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, priority, estimatedtime, status, performed_by)
             VALUES ($1, $2, 'room-service', $3, $4, 'paid-at-order', 'normal', NULL, 'pending', $5)
             RETURNING id, ordernumber`,
            [orderNumber, taxedTotal.toFixed(2), folioDetails.room_number, customerName, session.id]
          );
      const orderId = orderResult.rows[0].id;

      for (const item of selected) {
        await client.query(
          `INSERT INTO kitchen_orderitems
            (kitchenorderid, menuitemid, name, price, category, quantity, status, preptime, notes)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', NULL, $7)`,
          [orderId, item.menuItem.id, item.menuItem.name, item.menuItem.price, item.menuItem.category_slug || "food", item.quantity, `Room ${folioDetails.room_number || "N/A"} · Guest folio`]
        );
      }

      if (isWaived) {
        await client.query(`INSERT INTO complimentary_authorization_usage (authorization_id, transaction_id, applied_by, transaction_type, amount_used, note) VALUES ($1,$2,$3,'restaurant_order',$4,$5)`, [authorization.id, String(orderId), session.id, total.toFixed(2), `Restaurant order ${orderNumber} waived through VIP authorization`]);
      }
      const finance = await client.query(`SELECT id FROM transactions WHERE transaction_reference = $1 LIMIT 1`, [orderNumber]);
      if (!finance.rowCount) {
        await client.query(
          `INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by)
           VALUES (NULL, $1, $2, 'GHS', 'paid-at-order', 'completed', $3::jsonb, $4)`,
          [orderNumber, paidAtOrderTotal.toFixed(2), JSON.stringify({ source: "hotel-restaurant-paid-at-order", businessUnit: "shared", orderNumber, orderId, items: orderItems, orderType: "room-service", tableNumber: folioDetails.room_number, customerName, reservationId: params.data.reservationId, kitchenOrderId: orderId, grossAmount: total, paidAtOrder: true, complimentary: isWaived, performedBy: { id: session.id, name: session.name, email: session.email, role: session.role } }), session.id]
        );
      }

      return { orderId, orderNumber, total, folio, idempotent: false, paidAtOrder: true };
    });

    if (!result.idempotent) {
      await Promise.all([
        publishRealtime("orders.updated", String(result.orderId)),
        publishRealtime("pos.updated", String(result.orderId)),
        publishRealtime("inventory.updated", String(result.orderId)),
        publishRealtime("finance.updated", String(result.orderId)),
      ]);
    }
    return NextResponse.json({
    success: true,
    ...result,
    performedBy: { id: session.id, name: session.name, email: session.email, role: session.role },
    receiptUrl: `/receipt?orderNumber=${encodeURIComponent(result.orderNumber)}`,
  });
  } catch (error) {
    console.error("Failed to create restaurant folio order:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create restaurant order" }, { status: 400 });
  }
}
