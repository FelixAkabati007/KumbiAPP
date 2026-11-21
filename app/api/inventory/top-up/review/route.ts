import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { ensureTopUpReviewSchema } from "@/lib/db/ensure-topup-schema";

export async function GET(request: NextRequest) {
  const access = await requireRole("admin", "manager", "restaurantManager");
  if (access.error) return access.error;

  await ensureTopUpReviewSchema();

  try {
    const statusParam = request.nextUrl.searchParams.get("status");

    // Unified query from both inventory_top_up_audit and inventory_events (historical or direct restocks)
    const sql = `
      WITH unified_topups AS (
        SELECT a.id::text as id, a.inventory_item_id, a.quantity_before, a.quantity_added, a.quantity_after,
               a.performed_by, a.performed_at, a.source, a.request_metadata,
               COALESCE(a.status, a.request_metadata->>'status', 'pending_review') as status,
               a.reviewed_by, a.reviewed_by_name, a.reviewed_by_role, a.review_notes, a.reviewed_at,
               i.name as item_name, i.unit as item_unit, i.sku as item_sku, i.quantity as current_stock,
               i.cost_per_container, i.cost_per_item,
               COALESCE(u.name, u.email, a.request_metadata->>'staffName', 'Staff') as performed_by_name,
               COALESCE(u.role, a.request_metadata->>'staffRole', 'staff') as performed_by_role,
               COALESCE(a.evidence_pathname, a.request_metadata->>'evidencePathname', a.request_metadata->>'evidence_pathname') as evidence_pathname,
               a.request_metadata->>'reason' as reason,
               a.request_metadata->>'purchasePackagingPriceBefore' as purchase_packaging_price_before,
               a.request_metadata->>'purchasePackagingPriceAfter' as purchase_packaging_price_after
        FROM inventory_top_up_audit a
        JOIN inventory i ON i.id = a.inventory_item_id
        LEFT JOIN users u ON u.id = a.performed_by

        UNION ALL

        SELECT e.id::text as id, e.inventory_id as inventory_item_id, e.quantity_before,
               e.quantity_delta as quantity_added, e.quantity_after,
               e.staff_id as performed_by, e.created_at as performed_at,
               'event' as source, e.metadata as request_metadata,
               COALESCE(e.metadata->>'status', 'approved') as status,
               NULL as reviewed_by, NULL as reviewed_by_name, NULL as reviewed_by_role,
               NULL as review_notes, NULL as reviewed_at,
               i.name as item_name, i.unit as item_unit, i.sku as item_sku, i.quantity as current_stock,
               i.cost_per_container, i.cost_per_item,
               COALESCE(e.staff_name, u.name, u.email, 'Staff') as performed_by_name,
               COALESCE(e.staff_role, u.role, 'staff') as performed_by_role,
               COALESCE(e.metadata->>'evidencePathname', e.metadata->>'evidence_pathname') as evidence_pathname,
               COALESCE(e.reason, e.metadata->>'reason') as reason,
               COALESCE(e.purchase_packaging_price_before::text, e.metadata->>'purchasePackagingPriceBefore') as purchase_packaging_price_before,
               COALESCE(e.purchase_packaging_price_after::text, e.metadata->>'purchasePackagingPriceAfter') as purchase_packaging_price_after
        FROM inventory_events e
        JOIN inventory i ON i.id = e.inventory_id
        LEFT JOIN users u ON u.id = e.staff_id
        WHERE e.event_type IN ('RESTOCK', 'RESTOCK_AND_PRICE_CHANGE')
          AND NOT EXISTS (
            SELECT 1 FROM inventory_top_up_audit a2
            WHERE a2.idempotency_key = e.idempotency_key
               OR (a2.inventory_item_id = e.inventory_id AND ABS(EXTRACT(EPOCH FROM (a2.performed_at - e.created_at))) < 3)
          )
      )
      SELECT * FROM unified_topups
      ${statusParam && statusParam !== "all" ? "WHERE status = $1" : ""}
      ORDER BY performed_at DESC
      LIMIT 150
    `;

    const params: unknown[] = [];
    if (statusParam && statusParam !== "all") {
      params.push(statusParam);
    }

    const result = await query(sql, params);
    const rows = result.rows;
    const pendingCount = rows.filter((r) => (r as { status?: string }).status === "pending_review").length;

    return NextResponse.json({
      topUps: rows,
      pendingCount,
      totalCount: rows.length,
    });
  } catch (error) {
    console.error("Failed to fetch top-up review records:", error);
    return NextResponse.json({ error: "Failed to fetch top-up review records" }, { status: 500 });
  }
}
