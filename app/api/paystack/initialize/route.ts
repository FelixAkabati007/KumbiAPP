import { NextResponse } from "next/server";
import { PaystackService } from "@/lib/services/paystack-service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, amount, metadata } = body;

    if (!email || !amount) {
      return NextResponse.json(
        { error: "Email and amount are required" },
        { status: 400 },
      );
    }

    const paystackService = new PaystackService();
    const response = await paystackService.initializeTransaction(
      email,
      amount,
      metadata,
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Paystack initialization error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
