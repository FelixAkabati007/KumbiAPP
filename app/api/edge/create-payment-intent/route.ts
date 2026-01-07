import { NextResponse } from "next/server";

// POST /api/edge/create-payment-intent
// Migrated from Supabase Edge Function to Next.js API Route
// Handles Stripe Payment Intent creation

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, currency = "usd" } = body;

    // TODO: Initialize Stripe with process.env.STRIPE_SECRET_KEY
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

    // Mock response for now until Stripe is fully configured
    console.log("Creating payment intent for:", { amount, currency });

    return NextResponse.json({
      clientSecret: "pi_mock_secret_" + Date.now(),
      id: "pi_mock_" + Date.now(),
    });
  } catch (err: unknown) {
    console.error("create-payment-intent error", err);
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: 500 },
    );
  }
}
