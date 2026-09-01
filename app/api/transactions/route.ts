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

    let queryText = `
      SELECT id, transaction_id, amount, currency, status, payment_method,
             customer_id, items, metadata, created_at, updated_at
      FROM transaction_logs`;
    const params: (string | number | boolean | null)[] = [];
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
