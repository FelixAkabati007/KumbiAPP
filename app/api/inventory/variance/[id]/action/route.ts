import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { publishRealtime } from "@/lib/realtime";
import { updateSystemState } from "@/lib/system-sync";
import { ensureInventoryVariancesTable } from "@/lib/db/ensure-variance-table";

const isValidUuid = (val: unknown): boolean =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

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
    const reviewerUuid = isValidUuid(reviewer.id) ? reviewer.id : null;

    const result = await transaction(async (client) => {
      // 1. Lock variance row with scoped lock
      const varianceResult = await client.query(
        `SELECT v.*, i.name as item_name, i.unit as item_unit, i.quantity as current_stock
         FROM inventory_variances v
         JOIN inventory i ON i.id = v.inventory_item_id
         WHERE v.id::text = $1::text
         FOR UPDATE OF v`,
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

      if (variance.reported_by && variance.reported_by === reviewer.id && reviewer.role !== "admin") {
        throw Object.assign(
          new Error("Segregation of duties: Requesters cannot review their own stock issue report"),
          { code: "SELF_REVIEW_FORBIDDEN" }
        );
      }

      if (action === "approve") {
        const qtyToDeduct = Math.max(0, Number(variance.quantity));

        // 2. Lock and update inventory item balance
        const updatedInventory = await client.query(
          `UPDATE inventory
           SET quantity = GREATEST(0, quantity - $1), last_updated = NOW()
           WHERE id::text = $2::text
           RETURNING id, name, quantity, unit`,
          [qtyToDeduct, variance.inventory_item_id]
        );

        // 3. Record in inventory movements ledger (safe try/catch)
        try {
          await client.query(
            `INSERT INTO inventory_movements (
              inventory_id, quantity_delta, movement_type, source_type, source_id, actor_id, reason
            ) VALUES ($1, $2, 'write_off', 'inventory_variance', $3, $4, $5)`,
            [
              variance.inventory_item_id,
              -qtyToDeduct,
              variance.id,
              reviewerUuid,
              `Stock issue approved: ${variance.reason}${notes ? ` - ${notes}` : ""}`,
            ]
          );
        } catch (movErr) {
          console.warn("Failed to record inventory_movements ledger entry:", movErr);
        }

        // 4. Record in inventory_events audit trail (safe try/catch)
        try {
          const currentQty = Number(variance.current_stock ?? 0);
          const updatedQty = updatedInventory.rows[0]?.quantity ?? Math.max(0, currentQty - qtyToDeduct);
          await client.query(
            `INSERT INTO inventory_events (
              inventory_id, event_type, quantity_before, quantity_delta, quantity_after,
              reason, staff_id, staff_name, staff_role, correlation_id, metadata
            ) VALUES ($1, 'WRITE_OFF', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              variance.inventory_item_id,
              currentQty,
              -qtyToDeduct,
              updatedQty,
              `Stock write-off approved: ${variance.reason}${notes ? ` - ${notes}` : ""}`,
              reviewerUuid,
              reviewerName,
              reviewer.role,
              variance.id,
              JSON.stringify({
                varianceId: variance.id,
                reason: variance.reason,
                reportedBy: variance.reported_by_name,
                reviewerNotes: notes,
              }),
            ]
          );
        } catch (evErr) {
          console.warn("Failed to record inventory_events write-off:", evErr);
        }

        // 5. Update variance status to approved
        await client.query(
          `UPDATE inventory_variances
           SET status = 'approved',
               reviewed_by = $1,
               reviewed_by_name = $2,
               reviewed_by_role = $3,
               reviewer_notes = $4,
               reviewed_at = NOW(),
               updated_at = NOW()
           WHERE id::text = $5::text`,
          [reviewerUuid, reviewerName, reviewer.role, notes || null, id]
        );

        // 6. Notify the reporting staff (safe try/catch)
        if (variance.reported_by) {
          try {
            await client.query(
              `INSERT INTO notifications (recipient_user_id, title, message, type)
               VALUES ($1, $2, $3, 'inventory_variance')`,
              [
                variance.reported_by,
                `Stock Issue Approved: ${variance.item_name}`,
                `Your report for ${qtyToDeduct} ${variance.item_unit} of ${variance.item_name} was approved by ${reviewerName} (${reviewer.role}) and written off.${notes ? ` Note: ${notes}` : ""}`,
              ]
            );
          } catch (notifErr) {
            console.warn("Failed to notify reporting staff:", notifErr);
          }
        }

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
           WHERE id::text = $5::text`,
          [reviewerUuid, reviewerName, reviewer.role, notes, id]
        );

        // Notify reporting staff of rejection (safe try/catch)
        if (variance.reported_by) {
          try {
            await client.query(
              `INSERT INTO notifications (recipient_user_id, title, message, type)
               VALUES ($1, $2, $3, 'inventory_variance')`,
              [
                variance.reported_by,
                `Stock Issue Rejected: ${variance.item_name}`,
                `Your report for ${variance.quantity} ${variance.item_unit} of ${variance.item_name} was reviewed and rejected by ${reviewerName} (${reviewer.role}). Note: ${notes}`,
              ]
            );
          } catch (notifErr) {
            console.warn("Failed to notify reporting staff:", notifErr);
          }
        }

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
    if (err.code === "SELF_REVIEW_FORBIDDEN") {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err.code === "ALREADY_RESOLVED") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Failed to process stock issue action:", error);
    return NextResponse.json(
      { error: err.message || "Failed to process action on stock issue" },
      { status: 500 }
    );
  }
}
