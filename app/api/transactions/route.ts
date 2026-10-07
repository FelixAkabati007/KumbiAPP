import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const { error } = await requireFinanceAccess();
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const params: (string | number)[] = [];
    const conditions = ["LOWER(status) IN ('completed','succeeded','success','paid','posted','refunded','reversed','cancelled')", "COALESCE(amount, 0) <> 0"];
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const source = searchParams.get("source");
    const status = searchParams.get("status");
    const orderId = searchParams.get("orderId");
    const orderNumber = searchParams.get("orderNumber");
    const dateFilter = searchParams.get("dateFilter");
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "1000", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 1000;
    if (dateFilter && ["today", "week", "month"].includes(dateFilter)) { conditions.push(`occurred_at >= CURRENT_DATE - CASE $${params.length + 1} WHEN 'today' THEN INTERVAL '0 days' WHEN 'week' THEN INTERVAL '6 days' ELSE INTERVAL '1 month' END`); params.push(dateFilter); }
    if (startDate) { conditions.push(`occurred_at >= $${params.length + 1}`); params.push(startDate); }
    if (endDate) { conditions.push(`occurred_at < ($${params.length + 1}::date + INTERVAL '1 day')`); params.push(endDate); }
    if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
    if (source && ["hotel", "restaurant", "event", "shared_event", "shared"].includes(source)) { conditions.push(`LOWER(CASE WHEN source = 'event_booking' THEN 'event' WHEN source IN ('hotel-pre-checkin','hotel-pre-check-in','hotel_folio','hotel-folio','hotel-payment') THEN 'hotel' WHEN source IN ('pos-order-completion','restaurant-order','hotel-folio-restaurant') THEN 'restaurant' ELSE COALESCE(metadata->>'department', metadata->>'businessUnit', source, 'shared') END) = $${params.length + 1}`); params.push(source); }
    if (orderId) { conditions.push(`(entity_id = $${params.length + 1} OR metadata->>'orderId' = $${params.length + 1})`); params.push(orderId); }
    if (orderNumber) { conditions.push(`(event_key = $${params.length + 1} OR metadata->>'orderNumber' = $${params.length + 1})`); params.push(orderNumber); }
    const result = await query(`SELECT l.id::text id, l.event_key transaction_id, l.amount, l.currency, l.status, l.payment_method, NULL::text customer_id, l.metadata, COALESCE(pi.name, l.metadata->'performedBy'->>'accountName', l.metadata->'performedBy'->>'name', l.metadata->>'performedByAccountName') AS performed_by_name, COALESCE(pi.name, l.metadata->'performedBy'->>'accountName', l.metadata->'performedBy'->>'name', l.metadata->>'performedByAccountName') AS performed_by_account_name, COALESCE(pi.email, l.metadata->'performedBy'->>'email') AS performed_by_email, COALESCE(pi.role::text, l.metadata->'performedBy'->>'role') AS performed_by_role, COALESCE(ai.name, l.metadata->'approvedBy'->>'accountName', l.metadata->'approvedBy'->>'name', l.metadata->>'approvedByAccountName') AS approved_by_name, COALESCE(ai.name, l.metadata->'approvedBy'->>'accountName', l.metadata->'approvedBy'->>'name', l.metadata->>'approvedByAccountName') AS approved_by_account_name, COALESCE(ai.email, l.metadata->'approvedBy'->>'email') AS approved_by_email, COALESCE(ai.role::text, l.metadata->'approvedBy'->>'role') AS approved_by_role, l.occurred_at created_at, l.updated_at, l.source, l.entity_type, l.entity_id, l.direction, l.journal_type FROM canonical_financial_ledger l LEFT JOIN users pi ON pi.id::text = COALESCE(l.metadata->'performedBy'->>'id', l.metadata->>'performedBy') LEFT JOIN users ai ON ai.id::text = COALESCE(l.metadata->'approvedBy'->>'id', l.metadata->>'approvedBy') WHERE ${conditions.map((condition) => condition.replaceAll("metadata->>", "l.metadata->>").replaceAll("metadata->'", "l.metadata->'").replaceAll("source =", "l.source =").replaceAll("source,", "l.source,").replaceAll("status", "l.status").replaceAll("occurred_at", "l.occurred_at").replaceAll("amount", "l.amount").replaceAll("entity_id", "l.entity_id").replaceAll("event_key", "l.event_key")).join(" AND ")} ORDER BY l.occurred_at DESC LIMIT $${params.length + 1}`, [...params, limit]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch canonical transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}
