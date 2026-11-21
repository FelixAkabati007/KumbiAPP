import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";
import { updateSystemState } from "@/lib/system-sync";
import { ensureTopUpReviewSchema } from "@/lib/db/ensure-topup-schema";

interface TopUpAuditRecord {
  id: string;
  inventory_item_id: string;
  quantity_before: number | string;
  quantity_added: number | string;
  quantity_after: number | string;
  performed_by: string;
  performed_at: string;
  source?: string;
  status?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_by_role?: string;
  review_notes?: string;
  reviewed_at?: string;
  request_metadata?: Record<string, unknown> | null;
  item_name?: string;
  item_unit?: string;
  current_stock?: number | string;
  current_packaging_price?: number | string | null;
  current_cost_per_item?: number | string | null;
  quantity_per_container?: number | string | null;
  correlation_id?: string | null;
  idempotency_key?: string | null;
  evidence_pathname?: string | null;
}

interface NotificationMetadataRecord {
  metadata?: {
    auditId?: string;
    [key: string]: unknown;
  } | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireRole("admin", "manager", "restaurantManager");
  if (access.error) return access.error;

  await ensureTopUpReviewSchema();

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim().toLowerCase();
    const notes = String(body.notes ?? body.reason ?? "").trim();

    if (!["approve", "disapprove"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be either 'approve' or 'disapprove'" },
        { status: 400 }
      );
    }

    if (action === "disapprove" && !notes) {
      return NextResponse.json(
        { error: "Please provide a reason when disapproving a stock top-up" },
        { status: 400 }
      );
    }

    const reviewer = access.session;
    const reviewerName = reviewer.name || reviewer.email;

    const result = await transaction(async (client) => {
      let auditResult = { rows: [] as TopUpAuditRecord[] };
      try {
        auditResult = await client.query(
          `SELECT a.*, i.name as item_name, i.unit as item_unit, i.quantity as current_stock,
                  i.cost_per_container as current_packaging_price, i.cost_per_item as current_cost_per_item,
                  i.quantity_per_container
           FROM inventory_top_up_audit a
           JOIN inventory i ON i.id = a.inventory_item_id
           WHERE a.id = $1::text OR a.id::text = $1::text
           FOR UPDATE`,
          [id]
        );
      } catch {
        auditResult = { rows: [] };
      }

      if (!auditResult.rows[0]) {
        // Fallback: check if id is a notification id
        let notifResult = { rows: [] as NotificationMetadataRecord[] };
        try {
          notifResult = await client.query(
            `SELECT metadata FROM notifications WHERE id = $1::uuid LIMIT 1`,
            [id]
          );
        } catch {
          notifResult = { rows: [] };
        }
        const auditId = notifResult.rows[0]?.metadata?.auditId;
        if (auditId) {
          try {
            auditResult = await client.query(
              `SELECT a.*, i.name as item_name, i.unit as item_unit, i.quantity as current_stock,
                      i.cost_per_container as current_packaging_price, i.cost_per_item as current_cost_per_item,
                      i.quantity_per_container
               FROM inventory_top_up_audit a
               JOIN inventory i ON i.id = a.inventory_item_id
               WHERE a.id = $1::text OR a.id::text = $1::text
               FOR UPDATE`,
              [auditId]
            );
          } catch {
            auditResult = { rows: [] };
          }
        }
      }

      const audit = auditResult.rows[0];
      if (!audit) {
        throw Object.assign(new Error("Stock top-up record not found"), { code: "NOT_FOUND" });
      }

      // Check current status
      const currentStatus = audit.status || audit.request_metadata?.status || "pending_review";
      if (currentStatus === "approved" || currentStatus === "disapproved") {
        throw Object.assign(
          new Error(`This stock top-up has already been ${currentStatus}`),
          { code: "ALREADY_RESOLVED" }
        );
      }

      // Segregation of duties: requester cannot review own top-up unless admin
      if (audit.performed_by === reviewer.id && reviewer.role !== "admin") {
        throw Object.assign(
          new Error("Segregation of duties: Requesters cannot review their own stock top-up"),
          { code: "SELF_REVIEW_FORBIDDEN" }
        );
      }

      const quantityAdded = Number(audit.quantity_added);
      const reqMeta = typeof audit.request_metadata === "object" && audit.request_metadata ? audit.request_metadata : {};

      if (action === "approve") {
        // Mark audit as approved
        await client.query(
          `UPDATE inventory_top_up_audit
           SET status = 'approved',
               reviewed_by = $1,
               reviewed_by_name = $2,
               reviewed_by_role = $3,
               review_notes = $4,
               reviewed_at = NOW(),
               request_metadata = jsonb_set(COALESCE(request_metadata, '{}'::jsonb), '{status}', '"approved"')
           WHERE id = $5`,
          [reviewer.id, reviewerName, reviewer.role, notes || null, audit.id]
        );

        // Update notifications
        try {
          await client.query(
            `UPDATE notifications
             SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"approved"'),
                 read_at = COALESCE(read_at, NOW())
             WHERE (metadata->>'auditId' = $1::text OR id::text = $2::text)`,
            [audit.id, id]
          );
        } catch {
          // ignore
        }

        // Notify original staff member
        if (audit.performed_by && audit.performed_by !== reviewer.id) {
          try {
            await client.query(
              `INSERT INTO notifications (recipient_user_id, title, message, type)
               VALUES ($1, $2, $3, 'inventory_topup_decision')`,
              [
                audit.performed_by,
                `Stock Top-Up Verified: ${audit.item_name}`,
                `Your top-up of +${quantityAdded} ${audit.item_unit} for ${audit.item_name} was verified and approved by ${reviewerName} (${reviewer.role}).${notes ? ` Note: ${notes}` : ""}`,
              ]
            );
          } catch {
            // ignore
          }
        }

        return {
          status: "approved",
          itemName: audit.item_name,
          quantityAdded,
        };
      } else {
        // Disapprove & Revert
        const currentQty = Number(audit.current_stock ?? 0);
        const newQty = Math.max(0, currentQty - quantityAdded);
        const qtyPerContainer = Number(audit.quantity_per_container ?? 0);
        const priceBefore = Number(reqMeta.purchasePackagingPriceBefore ?? audit.current_packaging_price ?? 0);
        const costPerItemBefore = qtyPerContainer > 0 ? priceBefore / qtyPerContainer : Number(audit.current_cost_per_item ?? 0);

        // Revert stock balance and packaging price
        await client.query(
          `UPDATE inventory
           SET quantity = $1,
               container_count = CASE WHEN quantity_per_container > 0 THEN CEIL($1 / quantity_per_container) ELSE container_count END,
               cost_per_container = $2,
               cost_per_item = $3,
               last_updated = NOW()
           WHERE id = $4`,
          [newQty, priceBefore, costPerItemBefore, audit.inventory_item_id]
        );

        // Log rollback event in inventory_events
        await client.query(
          `INSERT INTO inventory_events (
             inventory_id, event_type, quantity_before, quantity_delta, quantity_after,
             purchase_packaging_price_before, purchase_packaging_price_after,
             cost_per_item_before, cost_per_item_after, reason,
             staff_id, staff_name, staff_role, correlation_id, idempotency_key, metadata, created_at
           ) VALUES ($1, 'RESTOCK_REVERSED', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
          [
            audit.inventory_item_id,
            currentQty,
            -quantityAdded,
            newQty,
            Number(audit.current_packaging_price ?? 0),
            priceBefore,
            Number(audit.current_cost_per_item ?? 0),
            costPerItemBefore,
            `Top-up disapproved: ${notes}`,
            reviewer.id,
            reviewerName,
            reviewer.role,
            audit.idempotency_key || audit.id,
            `reversal-${crypto.randomUUID()}`,
            JSON.stringify({
              disapprovedBy: reviewerName,
              disapprovedRole: reviewer.role,
              disapprovalReason: notes,
              originalAuditId: audit.id,
            }),
          ]
        );

        // Mark audit as disapproved
        await client.query(
          `UPDATE inventory_top_up_audit
           SET status = 'disapproved',
               reviewed_by = $1,
               reviewed_by_name = $2,
               reviewed_by_role = $3,
               review_notes = $4,
               reviewed_at = NOW(),
               request_metadata = jsonb_set(COALESCE(request_metadata, '{}'::jsonb), '{status}', '"disapproved"')
           WHERE id = $5`,
          [reviewer.id, reviewerName, reviewer.role, notes, audit.id]
        );

        // Update notifications
        try {
          await client.query(
            `UPDATE notifications
             SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"disapproved"'),
                 read_at = COALESCE(read_at, NOW())
             WHERE (metadata->>'auditId' = $1::text OR id::text = $2::text)`,
            [audit.id, id]
          );
        } catch {
          // ignore
        }

        // Notify original staff member of reversal
        if (audit.performed_by) {
          try {
            await client.query(
              `INSERT INTO notifications (recipient_user_id, title, message, type)
               VALUES ($1, $2, $3, 'inventory_topup_decision')`,
              [
                audit.performed_by,
                `Stock Top-Up Disapproved: ${audit.item_name}`,
                `Your top-up of +${quantityAdded} ${audit.item_unit} for ${audit.item_name} was disapproved by ${reviewerName} (${reviewer.role}) and stock was reverted. Reason: ${notes}`,
              ]
            );
          } catch {
            // ignore
          }
        }

        return {
          status: "disapproved",
          itemName: audit.item_name,
          quantityReverted: quantityAdded,
          newQuantity: newQty,
        };
      }
    });

    await Promise.all([
      publishRealtime("inventory.updated", id),
      publishRealtime("notifications.updated", id),
      updateSystemState("inventory"),
    ]);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    if (typed.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Stock top-up record not found" }, { status: 404 });
    }
    if (typed.code === "ALREADY_RESOLVED") {
      return NextResponse.json({ error: typed.message || "This stock top-up has already been reviewed" }, { status: 400 });
    }
    if (typed.code === "SELF_REVIEW_FORBIDDEN") {
      return NextResponse.json({ error: typed.message || "Segregation of duties: You cannot review your own stock top-up" }, { status: 403 });
    }
    console.error("Top-up review action failed:", error);
    return NextResponse.json({ error: "Failed to process top-up review action" }, { status: 500 });
  }
}
