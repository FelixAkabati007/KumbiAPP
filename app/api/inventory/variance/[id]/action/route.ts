import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { publishRealtime } from "@/lib/realtime";
import { updateSystemState } from "@/lib/system-sync";
import { ensureInventoryVariancesTable } from "@/lib/db/ensure-variance-table";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireRole("admin", "manager", "restaurantManager");
  if (access.error) return access.error;

  await ensureInventoryVariancesTable();

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim().toLowerCase();
    const notes = String(body.notes ?? "").trim();

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be either 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (action === "reject" && !notes) {
      return NextResponse.json(
        { error: "Please provide a reason or note when rejecting a stock issue" },
        { status: 400 }
      );
    }

    const reviewer = access.session;
    const reviewerName = reviewer.name || reviewer.email;

    const result = await transaction(async (client) => {
      // 1. Lock variance row
      const varianceResult = await client.query(
        `SELECT v.*, i.name as item_name, i.unit as item_unit, i.quantity as current_stock
         FROM inventory_variances v
         JOIN inventory i ON i.id = v.inventory_item_id
         WHERE v.id = $1 FOR UPDATE`,
        [id]
      );
      const variance = varianceResult.rows[0];
      if (!variance) {
        throw Object.assign(new Error("Stock issue report not found"), { code: "NOT_FOUND" });
      }

      if (variance.status !== "pending") {
        throw Object.assign(
          new Error(`This stock issue has already been ${variance.status}`),
          { code: "ALREADY_RESOLVED" }
        );
      }

      if (action === "approve") {
        const qtyToDeduct = Number(variance.quantity);

        // 2. Lock and update inventory item balance
        const updatedInventory = await client.query(
          `UPDATE inventory
           SET quantity = GREATEST(0, quantity - $1), last_updated = NOW()
           WHERE id = $2
           RETURNING id, name, quantity, unit`,
          [qtyToDeduct, variance.inventory_item_id]
        );

        // 3. Record in inventory movements ledger
        await client.query(
          `INSERT INTO inventory_movements (
            inventory_id, quantity_delta, movement_type, source_type, source_id, actor_id, reason
          ) VALUES ($1, $2, 'write_off', 'inventory_variance', $3, $4, $5)`,
          [
            variance.inventory_item_id,
            -qtyToDeduct,
            variance.id,
            reviewer.id,
            `Stock issue approved: ${variance.reason}${notes ? ` - ${notes}` : ""}`,
          ]
        );

        // 4. Update variance status to approved
        await client.query(
          `UPDATE inventory_variances
           SET status = 'approved',
               reviewed_by = $1,
               reviewed_by_name = $2,
               reviewed_by_role = $3,
               reviewer_notes = $4,
               reviewed_at = NOW(),
               updated_at = NOW()
           WHERE id = $5`,
          [reviewer.id, reviewerName, reviewer.role, notes || null, id]
        );

        // 5. Notify the reporting staff
        await client.query(
          `INSERT INTO notifications (recipient_user_id, title, message, type)
           VALUES ($1, $2, $3, 'inventory_variance')`,
          [
            variance.reported_by,
            `Stock Issue Approved: ${variance.item_name}`,
            `Your report for ${qtyToDeduct} ${variance.item_unit} of ${variance.item_name} was approved by ${reviewerName} (${reviewer.role}) and written off.${notes ? ` Note: ${notes}` : ""}`,
          ]
        );

        return {
          status: "approved",
          updatedStock: updatedInventory.rows[0]?.quantity,
          variance,
        };
      } else {
        // Reject action
        await client.query(
          `UPDATE inventory_variances
           SET status = 'rejected',
               reviewed_by = $1,
               reviewed_by_name = $2,
               reviewed_by_role = $3,
               reviewer_notes = $4,
               reviewed_at = NOW(),
               updated_at = NOW()
           WHERE id = $5`,
          [reviewer.id, reviewerName, reviewer.role, notes, id]
        );

        // Notify reporting staff of rejection
        await client.query(
          `INSERT INTO notifications (recipient_user_id, title, message, type)
           VALUES ($1, $2, $3, 'inventory_variance')`,
          [
            variance.reported_by,
            `Stock Issue Rejected: ${variance.item_name}`,
            `Your report for ${variance.quantity} ${variance.item_unit} of ${variance.item_name} was reviewed and rejected by ${reviewerName} (${reviewer.role}). Note: ${notes}`,
          ]
        );

        return {
          status: "rejected",
          variance,
        };
      }
    });

    // Write audit log
    await logAudit({
      action: action === "approve" ? "APPROVE_INVENTORY_VARIANCE" : "REJECT_INVENTORY_VARIANCE",
      entityType: "INVENTORY_VARIANCE",
      entityId: id,
      performedBy: reviewer.id,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      details: {
        action,
        varianceId: id,
        reviewerNotes: notes,
        reviewer: { id: reviewer.id, email: reviewer.email, role: reviewer.role },
      },
    });

    // Realtime broadcast to all clients
    await Promise.all([
      publishRealtime("inventory.updated", id),
      publishRealtime("notifications.updated", id),
      updateSystemState("inventory"),
    ]);

    return NextResponse.json({
      success: true,
      action,
      message:
        action === "approve"
          ? `Stock issue approved. ${result.variance.quantity} ${result.variance.item_unit} was written off from stock.`
          : "Stock issue rejected. Stock balance was left unchanged.",
    });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Stock issue report not found" }, { status: 404 });
    }
    if (err.code === "ALREADY_RESOLVED") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to process stock issue action:", error);
    return NextResponse.json({ error: "Failed to process action on stock issue" }, { status: 500 });
  }
}
