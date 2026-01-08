import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { updateSystemState } from "@/lib/system-sync";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      // type, // unused in DB schema directly, maybe put in metadata or map to status details
      orderId,
      amount,
      status,
      metadata,
      timestamp,
      paymentMethod,
      customerId,
    } = body;

    // transaction_logs schema:
    // id UUID (auto), transaction_id VARCHAR, amount, currency, status, payment_method, customer_id, items, metadata, created_at

    // Use provided id as transaction_id (e.g. Paystack reference) or generate one if missing
    const transactionId =
      id || `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const currency = "GHS";

    // Merge orderId into metadata if not present
    const finalMetadata = { ...metadata, orderId };

    await query(
      `INSERT INTO transaction_logs 
       (transaction_id, amount, currency, status, payment_method, customer_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        transactionId,
        amount,
        currency,
        status,
        paymentMethod || "unknown",
        customerId || null,
        JSON.stringify(finalMetadata),
        timestamp || new Date().toISOString(),
      ]
    );

    // Trigger system sync for orders/transactions
    await updateSystemState("orders");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to log transaction:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
