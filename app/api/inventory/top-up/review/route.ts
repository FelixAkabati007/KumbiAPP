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

    let sql = `
      SELECT a.id, a.inventory_item_id, a.quantity_before, a.quantity_added, a.quantity_after,
             a.performed_by, a.performed_at, a.source, a.request_metadata,
             COALESCE(a.status, a.request_metadata->>'status', 'pending_review') as status,
             a.reviewed_by, a.reviewed_by_name, a.reviewed_by_role, a.review_notes, a.reviewed_at,
             i.name as item_name, i.unit as item_unit, i.sku as item_sku, i.quantity as current_stock,
             i.cost_per_container, i.cost_per_item,
             COALESCE(u.name, u.email, a.request_metadata->>'staffName') as performed_by_name,
             COALESCE(u.role, a.request_metadata->>'staffRole') as performed_by_role,
             COALESCE(a.evidence_pathname, a.request_metadata->>'evidencePathname', a.request_metadata->>'evidence_pathname') as evidence_pathname,
             a.request_metadata->>'reason' as reason,
             a.request_metadata->>'purchasePackagingPriceBefore' as purchase_packaging_price_before,
             a.request_metadata->>'purchasePackagingPriceAfter' as purchase_packaging_price_after
      FROM inventory_top_up_audit a
      JOIN inventory i ON i.id = a.inventory_item_id
      LEFT JOIN users u ON u.id = a.performed_by
    `;

    const params: unknown[] = [];
    if (statusParam && statusParam !== "all") {
      sql += ` WHERE COALESCE(a.status, a.request_metadata->>'status', 'pending_review') = $1`;
      params.push(statusParam);
    }

    sql += ` ORDER BY a.performed_at DESC LIMIT 100`;

    const result = await query(sql, params);
    return NextResponse.json({ topUps: result.rows });
  } catch (error) {
    console.error("Failed to fetch top-up review records:", error);
    return NextResponse.json({ error: "Failed to fetch top-up review records" }, { status: 500 });
  }
}
