import { NextResponse } from "next/server";
import { PaystackService } from "@/lib/services/paystack-service";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reference, amount } = body;

    if (!reference) {
      return NextResponse.json(
        { error: "Transaction reference is required" },
        { status: 400 },
      );
    }

    const paystackService = new PaystackService();
    const response = await paystackService.refundTransaction(reference, amount);

    // Log refund to database
    if (response.status) {
      try {
        await query(
          `UPDATE transaction_logs 
           SET status = 'refunded', 
               metadata = jsonb_set(COALESCE(metadata, '{}'), '{refund_info}', $2) 
           WHERE transaction_id = $1`,
          [
            reference,
            JSON.stringify(response.data || { amount, timestamp: new Date() }),
          ],
        );
      } catch (dbError) {
        console.error("Failed to log refund to DB:", dbError);
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
