import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const { error } = await requirePermission("payments");
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

    if (source === "hotel") {
      const hotelParams: (string | number)[] = [];
      const hotelConditions: string[] = [];
      if (startDate) { hotelConditions.push(`occurred_at >= $${hotelParams.length + 1}`); hotelParams.push(startDate); }
      if (endDate) { hotelConditions.push(`occurred_at < ($${hotelParams.length + 1}::date + INTERVAL '1 day')`); hotelParams.push(endDate); }
      const hotelWhere = hotelConditions.length ? ` WHERE ${hotelConditions.join(" AND ")}` : "";
      const hotelResult = await query(`SELECT id::text, 'HOTEL-' || id::text AS transaction_id, amount, currency, CASE WHEN amount = 0 THEN 'activity' ELSE 'completed' END AS status, 'hotel' AS payment_method, guest_id::text AS customer_id, NULL::jsonb AS items, jsonb_build_object('source','hotel','eventType',event_type,'entityType',entity_type,'entityId',entity_id,'description',description,'reservationId',reservation_id,'roomId',room_id) AS metadata, occurred_at AS created_at, created_at AS updated_at FROM hotel_activity_ledger${hotelWhere} ORDER BY occurred_at DESC LIMIT $${hotelParams.length + 1}`, [...hotelParams, limit]);
      return NextResponse.json(hotelResult.rows);
    }

    const params: (string | number | boolean | null)[] = [];
    let queryText = `
      SELECT id, transaction_id, amount, currency, status, payment_method,
             customer_id, items, metadata, created_at, updated_at
      FROM transaction_logs`;
    const hotelParams: (string | number)[] = [];
    const hotelConditions: string[] = [];
    if (startDate) { hotelConditions.push(`occurred_at >= $${hotelParams.length + 1}`); hotelParams.push(startDate); }
    if (endDate) { hotelConditions.push(`occurred_at < ($${hotelParams.length + 1}::date + INTERVAL '1 day')`); hotelParams.push(endDate); }
    if (source === "restaurant") {
      queryText = `${queryText}`;
    } else {
      const hotelWhere = hotelConditions.length ? ` WHERE ${hotelConditions.join(" AND ")}` : "";
      queryText = `SELECT id::text, 'HOTEL-' || id::text AS transaction_id, amount, currency,
        CASE WHEN amount = 0 THEN 'activity' ELSE 'completed' END AS status,
        'hotel' AS payment_method, guest_id::text AS customer_id, NULL::jsonb AS items,
        jsonb_build_object('source','hotel','eventType',event_type,'entityType',entity_type,'entityId',entity_id,'description',description,'reservationId',reservation_id,'roomId',room_id) AS metadata,
        occurred_at AS created_at, created_at AS updated_at FROM hotel_activity_ledger${hotelWhere}
        UNION ALL ${queryText}`;
      params.push(...hotelParams);
    }
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

    if (source === "hotel" || source === "restaurant") {
      conditions.push(`metadata->>'source' = $${params.length + 1}`);
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
