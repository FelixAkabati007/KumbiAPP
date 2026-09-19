import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { transaction } from "@/lib/db";
import { publishRealtime } from "@/lib/realtime";

const paramsSchema = z.object({ reservationId: z.string().uuid(), orderId: z.string().uuid() });
const cancellationSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string; orderId: string }> }
) {
  try {
    const { session, error: authError } = await requirePermission("guestFolio");
    if (authError) return authError;
    const params = paramsSchema.safeParse(await context.params);
    const body = cancellationSchema.safeParse(await request.json());
    if (!params.success || !body.success) return NextResponse.json({ error: "A valid order and cancellation reason are required" }, { status: 400 });

    const result = await transaction(async (client) => {
      const orderResult = await client.query(
        `SELECT ko.id, ko.status, ko.ordernumber, ko.total, gfi.id AS folio_item_id, gfi.folio_id, gfi.total_amount, gf.reservation_id
         FROM kitchenorders ko
         JOIN guest_folio_items gfi ON gfi.source_id::text = ko.id::text AND gfi.source_type = 'restaurant_order' AND gfi.reversed_at IS NULL
         JOIN guest_folios gf ON gf.id = gfi.folio_id
         WHERE ko.id = $1 AND gf.reservation_id = $2
         FOR UPDATE`,
        [params.data.orderId, params.data.reservationId]
      );
      const order = orderResult.rows[0];
      if (!order) return { kind: "missing" as const };
      if (!["pending", "accepted", "preparing"].includes(String(order.status).toLowerCase())) return { kind: "invalid_state" as const, status: order.status };

      const itemResult = await client.query(`SELECT inventory_id, quantity_delta, menu_item_id FROM inventory_movements WHERE source_type = 'hotel_restaurant_order' AND source_id = $1 AND movement_type = 'sale' FOR UPDATE`, [order.ordernumber]);
      for (const movement of itemResult.rows) {
        await client.query(`UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2`, [movement.quantity_delta, movement.inventory_id]);
        await client.query(`INSERT INTO inventory_movements (inventory_id, quantity_delta, movement_type, source_type, source_id, menu_item_id, order_id, actor_id, reason) VALUES ($1, $2, 'cancellation_reversal', 'hotel_restaurant_order', $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`, [movement.inventory_id, -Number(movement.quantity_delta), order.ordernumber, movement.menu_item_id, order.id, session.id, body.data.reason]);
      }

      await client.query(`UPDATE kitchenorders SET status = 'cancelled', cancellation_reason = $1, cancelled_at = NOW(), cancelled_by = $2, cancellation_source = 'guest_folio' WHERE id = $3`, [body.data.reason, session.id, order.id]);
      await client.query(`UPDATE guest_folio_items SET reversed_at = NOW(), reversed_by = $1, reversal_reason = $2, total_amount = 0, unit_amount = 0 WHERE id = $3`, [session.id, body.data.reason, order.folio_item_id]);
      await client.query(`UPDATE guest_folios SET food_charges = GREATEST(0, COALESCE(food_charges, 0) - COALESCE($1, 0)), total_charges = GREATEST(0, COALESCE(total_charges, 0) - COALESCE($1, 0)), balance = GREATEST(0, COALESCE(total_charges, 0) - COALESCE($1, 0) - COALESCE(paid_amount, 0)), last_updated = NOW() WHERE id = $2`, [order.total_amount, order.folio_id]);
      await client.query(`INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by) SELECT NULL, $1, $2, 'GHS', 'folio-reversal', 'completed', jsonb_build_object('source', 'hotel-folio-restaurant', 'orderId', $3, 'kind', 'cancellation-reversal', 'reason', $4, 'performedBy', $5::jsonb), $6 WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE transaction_reference = $1)`, [`REV-${order.ordernumber}`, Number(order.total_amount), order.id, body.data.reason, JSON.stringify({ id: session.id, name: session.name, email: session.email }), session.id]);
      return { kind: "cancelled" as const, orderId: order.id, orderNumber: order.ordernumber, folioId: order.folio_id };
    });

    if (result.kind === "missing") return NextResponse.json({ error: "Order not found for this reservation" }, { status: 404 });
    if (result.kind === "invalid_state") return NextResponse.json({ error: `Order cannot be cancelled from ${result.status} state` }, { status: 409 });
    await Promise.all([publishRealtime("orders.updated", String(result.orderId)), publishRealtime("inventory.updated", String(result.orderId)), publishRealtime("finance.updated", String(result.orderId))]);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Failed to cancel restaurant folio order:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to cancel restaurant order" }, { status: 400 });
  }
}
