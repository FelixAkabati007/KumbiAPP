import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";
import { updateSystemState } from "@/lib/system-sync";
import { requirePermission } from "@/lib/api-auth";
import { CANONICAL_PAYMENT_METHODS } from "@/lib/types/payment";

export async function POST(req: Request) {
  try {
    const { error } = await requirePermission("payments");
    if (error) return error;

    const body = await req.json();
    const {
      id,
      type,
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
    const canonicalPaymentMethod = paymentMethod || "other";
    if (!CANONICAL_PAYMENT_METHODS.includes(canonicalPaymentMethod as (typeof CANONICAL_PAYMENT_METHODS)[number])) {
      return NextResponse.json({ error: "Choose a valid payment method" }, { status: 400 });
    }

    // Merge orderId and type into metadata if not present
    const finalMetadata = {
      ...metadata,
      source: metadata?.source || "restaurant",
      orderId,
      type,
    };

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO transaction_logs
         (transaction_id, amount, currency, status, payment_method, customer_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          transactionId,
          amount,
          currency,
          status,
          canonicalPaymentMethod,
          customerId || null,
          JSON.stringify(finalMetadata),
          timestamp || new Date().toISOString(),
        ]
      );

      await recordFinancialLedgerEntry(client, {
        eventKey: `pos-payment:${transactionId}`,
        amount: Number(amount),
        currency,
        direction: "credit",
        status,
        source: "pos",
        paymentMethod: canonicalPaymentMethod,
        entityType: "order",
        entityId: orderId || transactionId,
        metadata: finalMetadata,
        occurredAt: timestamp || undefined,
      });
    });

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
