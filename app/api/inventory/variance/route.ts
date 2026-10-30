import { NextRequest, NextResponse } from "next/server";
import { putBlob } from "@/lib/blob-storage";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { publishRealtime } from "@/lib/realtime";
import { updateSystemState } from "@/lib/system-sync";
import { ensureInventoryVariancesTable } from "@/lib/db/ensure-variance-table";

const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MANAGER_ROLES = new Set(["admin", "manager", "restaurantManager"]);

export async function GET(request: NextRequest) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;

  await ensureInventoryVariancesTable();

  try {
    const isManager = MANAGER_ROLES.has(access.session.role);
    const statusFilter = request.nextUrl.searchParams.get("status");

    let sql = `
      SELECT v.*, i.name as item_name, i.sku as item_sku, i.unit as item_unit, i.quantity as current_stock
      FROM inventory_variances v
      JOIN inventory i ON i.id = v.inventory_item_id
    `;
    const params: unknown[] = [];

    if (!isManager) {
      params.push(access.session.id);
      sql += ` WHERE v.reported_by = $${params.length}`;
      if (statusFilter) {
        params.push(statusFilter);
        sql += ` AND v.status = $${params.length}`;
      }
    } else if (statusFilter) {
      params.push(statusFilter);
      sql += ` WHERE v.status = $${params.length}`;
    }

    sql += ` ORDER BY v.created_at DESC LIMIT 100`;

    const result = await query(sql, params);
    return NextResponse.json({ variances: result.rows });
  } catch (error) {
    console.error("Failed to fetch inventory variances:", error);
    return NextResponse.json({ error: "Failed to fetch stock issues" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;

  await ensureInventoryVariancesTable();

  try {
    const form = await request.formData();
    const inventoryItemId = String(form.get("inventoryItemId") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    const quantity = Number(form.get("quantity") ?? 0);
    const explanation = String(form.get("explanation") ?? "").trim();
    const evidence = form.get("evidence");

    if (!inventoryItemId || !reason || !explanation || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Item, reason, quantity, and explanation are required" }, { status: 400 });
    }
    if (!(evidence instanceof File) || !IMAGE_TYPES.has(evidence.type) || evidence.size > MAX_EVIDENCE_SIZE) {
      return NextResponse.json({ error: "One JPEG, PNG, or WebP evidence image under 5MB is required" }, { status: 400 });
    }

    const itemResult = await query("SELECT id, name, sku, quantity, unit FROM inventory WHERE id = $1", [inventoryItemId]);
    const item = itemResult.rows[0];
    if (!item) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

    const blob = await putBlob(
      `inventory-evidence/${inventoryItemId}/${crypto.randomUUID()}.${evidence.type.split("/")[1]}`,
      evidence,
      { access: "private", addRandomSuffix: false }
    );

    const reportId = crypto.randomUUID();
    const reporterName = access.session.name || access.session.email;
    const reporterRole = access.session.role;

    // 1. Persist the variance record
    await query(
      `INSERT INTO inventory_variances (
        id, inventory_item_id, reported_by, reported_by_name, reported_by_role,
        reason, quantity, explanation, evidence_pathname, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
      [
        reportId,
        inventoryItemId,
        access.session.id,
        reporterName,
        reporterRole,
        reason,
        quantity,
        explanation,
        blob.pathname,
      ]
    );

    // 2. Notify all active General Managers, Admins, and Restaurant Managers
    const managers = await query(
      `SELECT id, email, role FROM users WHERE role IN ('admin', 'manager', 'restaurantManager') AND is_active = true`
    );

    const formattedReason = reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const notifTitle = `Stock Issue Reported: ${item.name}`;
    const notifMessage = `${reporterName} (${reporterRole}) reported ${quantity} ${item.unit} of ${item.name} as ${formattedReason}. Explanation: ${explanation}`;

    for (const manager of managers.rows) {
      await query(
        `INSERT INTO notifications (recipient_user_id, title, message, type)
         VALUES ($1, $2, $3, 'inventory_variance')`,
        [manager.id, notifTitle, notifMessage]
      );
    }

    // 3. Write immutable audit log
    await logAudit({
      action: "SUBMIT_INVENTORY_VARIANCE",
      entityType: "INVENTORY_VARIANCE",
      entityId: reportId,
      performedBy: access.session.id,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      details: {
        status: "pending",
        inventoryItem: item,
        quantity,
        reason,
        explanation,
        evidencePathname: blob.pathname,
        actor: { id: access.session.id, email: access.session.email, role: access.session.role },
        reviewRequired: true,
      },
    });

    // 4. Publish real-time events to all connected clients
    await Promise.all([
      publishRealtime("inventory.updated", reportId),
      publishRealtime("notifications.updated", reportId),
      updateSystemState("inventory"),
    ]);

    return NextResponse.json(
      {
        success: true,
        id: reportId,
        varianceId: reportId,
        status: "pending",
        notifiedManagersCount: managers.rows.length,
        message: "Stock issue reported and sent to General Manager and Restaurant Manager for review.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Inventory variance submission failed:", error);
    return NextResponse.json({ error: "Failed to submit inventory variance" }, { status: 500 });
  }
}
