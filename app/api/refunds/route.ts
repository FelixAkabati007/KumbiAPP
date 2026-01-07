import { NextResponse } from "next/server";
import { query, checkConnection } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ok = await checkConnection();
    if (!ok) {
      return NextResponse.json([]);
    }
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");
    const status = searchParams.get("status");

    let queryText = "SELECT * FROM refundrequests";
    const params: (string | number | boolean | null)[] = [];
    const conditions: string[] = [];

    if (orderId) {
      conditions.push(`orderid = $${params.length + 1}`);
      params.push(orderId);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      queryText += " WHERE " + conditions.join(" AND ");
    }

    queryText += " ORDER BY requestedat DESC";

    const result = await query(queryText, params);

    // Map DB fields to camelCase for frontend compatibility if needed,
    // but better to align frontend to use the API response directly or map it there.
    // Let's return as is and handle mapping in the frontend service or component.
    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderId,
      orderNumber,
      customerName,
      originalAmount,
      refundAmount,
      paymentMethod,
      reason,
      authorizedBy,
      additionalNotes,
      requestedBy,
    } = body;

    // Validation
    if (!orderId || !refundAmount || !reason || !authorizedBy) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO refundrequests (
        orderid, ordernumber, customername, originalamount, refundamount,
        paymentmethod, reason, authorizedby, additionalnotes, requestedby,
        status, requestedat
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW())
      RETURNING *`,
      [
        orderId,
        orderNumber,
        customerName,
        originalAmount,
        refundAmount,
        paymentMethod,
        reason,
        authorizedBy,
        additionalNotes || null,
        requestedBy,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create refund request:", error);
    return NextResponse.json(
      { error: "Failed to create refund request" },
      { status: 500 }
    );
  }
}
