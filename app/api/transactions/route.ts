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
    if (source && ["hotel", "restaurant", "event", "shared_event", "shared"].includes(source)) { conditions.push(`LOWER(CASE WHEN source = 'event_booking' THEN 'event' ELSE COALESCE(metadata->>'department', metadata->>'businessUnit', source, 'shared') END) = $${params.length + 1}`); params.push(source); }
    if (orderId) { conditions.push(`(entity_id = $${params.length + 1} OR metadata->>'orderId' = $${params.length + 1})`); params.push(orderId); }
    if (orderNumber) { conditions.push(`(event_key = $${params.length + 1} OR metadata->>'orderNumber' = $${params.length + 1})`); params.push(orderNumber); }
    const result = await query(`SELECT id::text id, event_key transaction_id, amount, currency, status, payment_method, NULL::text customer_id, metadata, occurred_at created_at, updated_at, source, entity_type, entity_id, direction, journal_type FROM canonical_financial_ledger WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC LIMIT $${params.length + 1}`, [...params, limit]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch canonical transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}
