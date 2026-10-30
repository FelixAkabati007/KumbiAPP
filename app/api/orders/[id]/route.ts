import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, error } = await requirePermission("orderBoard");
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const { status, priority, chefNotes } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (chefNotes !== undefined) {
      updates.push(`chefnotes = $${paramIndex++}`);
      values.push(chefNotes);
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "No updates provided" });
    }

    updates.push(`updated_at = timezone('utc', now())`);
    values.push(id);

    const queryText = `
      UPDATE kitchenorders
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    let inventoryReversed = false;

    const updatedOrder = await transaction(async (client) => {
      // Check current order state before applying update
      const existingRes = await client.query(
        `SELECT id, ordernumber, status FROM kitchenorders WHERE id = $1 FOR UPDATE`,
        [id],
      );

      if (existingRes.rowCount === 0) {
        return null;
      }

      const previousOrder = existingRes.rows[0];
      const result = await client.query(queryText, values);
      const orderRow = result.rows[0];

      // If transitioning to 'cancelled' from a non-cancelled state, atomically reverse stock deductions
      if (status === "cancelled" && previousOrder.status !== "cancelled") {
        const movementsRes = await client.query(
          `SELECT id, inventory_id, menu_item_id, quantity_delta
           FROM inventory_movements
           WHERE (order_id::text = $1::text OR source_id = $2)
             AND LOWER(movement_type) = 'sale'
             AND NOT EXISTS (
               SELECT 1 FROM inventory_movements rev
               WHERE (rev.order_id::text = $1::text OR rev.source_id = $2)
                 AND LOWER(rev.movement_type) IN ('return', 'reversal')
             )`,
          [id, previousOrder.ordernumber || ""],
        );

        for (const mov of movementsRes.rows) {
          const restoreQty = Math.abs(Number(mov.quantity_delta || 0));
          if (restoreQty > 0 && mov.inventory_id) {
            await client.query(
              `UPDATE inventory
               SET quantity = quantity + $1, last_updated = NOW()
               WHERE id = $2`,
              [restoreQty, mov.inventory_id],
            );
            await client.query(
              `INSERT INTO inventory_movements (
                 inventory_id, menu_item_id, quantity_delta, movement_type,
                 source_type, source_id, order_id, reason, actor_id
               ) VALUES ($1, $2, $3, 'return', 'order_cancellation', $4, $5, $6, $7)`,
              [
                mov.inventory_id,
                mov.menu_item_id || null,
                restoreQty,
                previousOrder.ordernumber || String(id),
                id,
                `Automatic stock restoration for cancelled order ${previousOrder.ordernumber || id}`,
                session.id,
              ],
            );
            inventoryReversed = true;
          }
        }

        // Mark canonical financial ledger entry as cancelled if present
        await client.query(
          `UPDATE canonical_financial_ledger
           SET status = 'cancelled', updated_at = NOW()
           WHERE entity_id = $1 OR event_key = $2`,
          [String(id), `pos-order:${previousOrder.ordernumber || ""}`],
        );
      }

      return orderRow;
    });

    if (!updatedOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await publishRealtime("orders.updated", String(id));
    if (inventoryReversed) {
      await publishRealtime("inventory.updated", String(id));
      await publishRealtime("finance.updated", String(id));
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      inventoryReversed,
    });
  } catch (error) {
    console.error("Failed to update order:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 },
    );
  }
}
