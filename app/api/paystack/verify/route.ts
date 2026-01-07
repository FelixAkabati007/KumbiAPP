import { NextResponse } from "next/server";
import { PaystackService } from "@/lib/services/paystack-service";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");

  if (!reference) {
    return NextResponse.json(
      { error: "Transaction reference is required" },
      { status: 400 },
    );
  }

  try {
    const paystackService = new PaystackService();
    const response = await paystackService.verifyTransaction(reference);

    // Log successful transaction to database
    if (response.status && response.data.status === "success") {
      try {
        const {
          reference: txnRef,
          amount,
          currency,
          status,
          channel,
          metadata,
          customer,
        } = response.data;

        // Ensure amount is in main currency unit (GHS) not pesewas
        const amountGHS = amount / 100;

        await query(
          `INSERT INTO transaction_logs 
           (transaction_id, amount, currency, status, payment_method, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (transaction_id) 
           DO UPDATE SET status = EXCLUDED.status, metadata = EXCLUDED.metadata`,
          [
            txnRef,
            amountGHS,
            currency,
            status,
            channel,
            JSON.stringify({ ...metadata, customer }),
          ],
        );
      } catch (dbError) {
        console.error("Failed to log transaction to DB:", dbError);
        // Don't fail the request if logging fails, but log it
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Paystack verification error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
