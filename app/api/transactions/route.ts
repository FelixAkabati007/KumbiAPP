import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const { error } = await requireFinanceAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");
    const orderNumber = searchParams.get("orderNumber");
    const orderId = searchParams.get("orderId");
    const source = searchParams.get("source");
    const requestedLimit = searchParams.get("limit")
      ? Number.parseInt(searchParams.get("limit")!, 10)
      : 1000;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 1000;

    const params: (string | number | boolean | null)[] = [];
    let queryText = `
      WITH unified_transactions AS (
        SELECT id::text AS id, transaction_id::text AS transaction_id,
               amount, currency, status, payment_method,
               customer_id::text AS customer_id, items,
               COALESCE(metadata, '{}'::jsonb) AS metadata,
               created_at, created_at AS updated_at
        FROM transaction_logs

        UNION ALL

        SELECT id::text AS id, transaction_reference::text AS transaction_id,
               amount, currency, status, method::text AS payment_method,
               NULL::text AS customer_id, NULL::jsonb AS items,
               jsonb_build_object(
                 'source', 'hotel',
                 'orderId', order_id,
                 'performedBy', performed_by
               ) || COALESCE(metadata, '{}'::jsonb) AS metadata,
               created_at, created_at AS updated_at
        FROM transactions

        UNION ALL

        SELECT id::text AS id, 'HOTEL-' || id::text AS transaction_id,
               amount, currency,
               CASE WHEN amount = 0 THEN 'activity' ELSE 'completed' END AS status,
               'hotel' AS payment_method, guest_id::text AS customer_id,
               NULL::jsonb AS items,
               jsonb_build_object(
                 'source', 'hotel', 'eventType', event_type,
                 'entityType', entity_type, 'entityId', entity_id,
                 'description', description, 'reservationId', reservation_id,
                 'roomId', room_id
               ) AS metadata,
               occurred_at AS created_at, created_at AS updated_at
        FROM hotel_activity_ledger

        UNION ALL

        SELECT id::text AS id, event_key AS transaction_id,
               amount, currency, status, payment_method,
               NULL::text AS customer_id, NULL::jsonb AS items,
               jsonb_build_object(
                 'source', source, 'entityType', entity_type,
                 'entityId', entity_id
               ) || COALESCE(metadata, '{}'::jsonb) AS metadata,
               occurred_at AS created_at, updated_at
        FROM canonical_financial_ledger
      )
      SELECT id, transaction_id, amount, currency, status, payment_method,
             customer_id, items, metadata, created_at, updated_at
      FROM unified_transactions`;
    const conditions: string[] = [];

    if (startDate) {
      conditions.push(`created_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(
        `created_at < ($${params.length + 1}::date + INTERVAL '1 day')`
      );
      params.push(endDate);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (orderNumber) {
      conditions.push(
        `LOWER(metadata->>'orderNumber') = LOWER($${params.length + 1})`
      );
      params.push(orderNumber);
    }

    if (source === "hotel" || source === "restaurant" || source === "event" || source === "refund") {
      conditions.push(
        `(LOWER(COALESCE(metadata->>'source', '')) = $${params.length + 1} OR ($${params.length + 1} = 'restaurant' AND metadata->>'source' IS NULL AND metadata->>'orderType' IS NOT NULL))`,
      );
      params.push(source);
    }

    if (orderId) {
      conditions.push(
        `(metadata->>'orderId' = $${params.length + 1} OR transaction_id = $${
          params.length + 1
        })`
      );
      params.push(orderId);
    }

    if (conditions.length > 0) {
      queryText += " WHERE " + conditions.join(" AND ");
    }

    queryText += " ORDER BY created_at DESC";

    if (limit > 0) {
      queryText += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }

    const result = await query(queryText, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
