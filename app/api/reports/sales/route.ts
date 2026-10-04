import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";

const SUCCESS_STATUSES = ["success", "successful", "completed", "succeeded", "paid", "posted"];

export async function GET(request: Request) {
  try {
    const { error } = await requireFinanceAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const source = searchParams.get("source");
    const search = searchParams.get("search");
    const params: unknown[] = [];
    const filters: string[] = [
      `LOWER(TRIM(status)) = ANY($${params.length + 1}::text[])`,
      `amount > 0`,
    ];
    params.push(SUCCESS_STATUSES);

    if (startDate) {
      filters.push(`created_at >= $${params.length + 1}::date`);
      params.push(startDate);
    }
    if (endDate) {
      filters.push(`created_at < ($${params.length + 1}::date + INTERVAL '1 day')`);
      params.push(endDate);
    }
    if (source && ["hotel", "restaurant", "event"].includes(source)) {
      filters.push(`source = $${params.length + 1}`);
      params.push(source);
    }
    if (search?.trim()) {
      filters.push(`(LOWER(order_number) LIKE LOWER($${params.length + 1}) OR LOWER(COALESCE(customer_name, '')) LIKE LOWER($${params.length + 1}))`);
      params.push(`%${search.trim()}%`);
    }

    const result = await query(
      `WITH raw_sales AS (
        SELECT id::text AS source_id, transaction_id::text AS order_number, amount, status,
          LOWER(COALESCE(metadata->>'source', CASE WHEN metadata->>'orderType' IS NOT NULL THEN 'restaurant' ELSE 'restaurant' END)) AS source,
          LOWER(COALESCE(payment_method, 'unknown')) AS payment_method,
          COALESCE(metadata->>'customerName', metadata->>'guestName', customer_id::text) AS customer_name,
          items, created_at, 3 AS precedence
        FROM transaction_logs
        UNION ALL
        SELECT id::text, transaction_reference::text, amount, status, 'hotel', LOWER(COALESCE(method::text, 'unknown')),
          NULL, NULL, created_at, 2 FROM transactions
        UNION ALL
        SELECT id::text, 'HOTEL-' || id::text, amount,
          CASE WHEN amount = 0 THEN 'activity' ELSE 'completed' END, 'hotel', 'hotel', NULL, NULL, occurred_at, 1
        FROM hotel_activity_ledger WHERE COALESCE(amount, 0) <> 0
        UNION ALL
        SELECT id::text,
          CASE WHEN entity_type = 'event' THEN 'EVENT-' || UPPER(LEFT(entity_id::text, 8)) ELSE event_key END,
          amount, status,
          CASE WHEN entity_type = 'event' THEN 'event' ELSE LOWER(COALESCE(source, 'restaurant')) END,
          LOWER(COALESCE(payment_method, 'unknown')), metadata->>'customerName', NULL, occurred_at, 4
        FROM canonical_financial_ledger WHERE COALESCE(amount, 0) <> 0
        UNION ALL
        SELECT id::text, order_number, COALESCE((snapshot->>'total')::numeric, 0), 'completed', 'event', 'event booking',
          snapshot->'event'->>'client_name', COALESCE(snapshot->'quote'->'items', '[]'::jsonb), created_at, 5
        FROM hotel_receipts WHERE receipt_type = 'event_booking'
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY LOWER(order_number)
          ORDER BY precedence DESC, created_at DESC
        ) AS row_rank
        FROM raw_sales
        WHERE ${filters.join(" AND ")}
      )
      SELECT source_id AS id, order_number, amount, source, payment_method, customer_name,
        COALESCE(items, '[]'::jsonb) AS items, created_at
      FROM ranked WHERE row_rank = 1
      ORDER BY created_at DESC`,
      params,
    );

    const rows = result.rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      date: row.created_at,
      total: Number(row.amount) || 0,
      orderType: row.source,
      paymentMethod: row.payment_method,
      customerName: row.customer_name,
      items: Array.isArray(row.items) ? row.items : [],
    }));

    return NextResponse.json({
      rows,
      generatedAt: new Date().toISOString(),
      sourceOfTruth: "canonical sales read model",
      statusScope: SUCCESS_STATUSES,
    });
  } catch (error) {
    console.error("Failed to build canonical sales report:", error);
    return NextResponse.json({ error: "Failed to build sales report" }, { status: 500 });
  }
}
