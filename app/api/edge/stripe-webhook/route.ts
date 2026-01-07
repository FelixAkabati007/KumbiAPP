import { NextResponse } from "next/server";

// POST /api/edge/stripe-webhook
// Migrated from Supabase Edge Function to Next.js API Route
// Handles Stripe Webhooks (e.g., payment_intent.succeeded)

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json(
        { error: "Missing stripe-signature" },
        { status: 400 },
      );
    }

    // TODO: Verify signature with Stripe
    // const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

    // Mock event processing
    console.log("Received Stripe webhook");

    // Example: Update order status on successful payment
    // if (event.type === 'payment_intent.succeeded') {
    //   const paymentIntent = event.data.object;
    //   await query('UPDATE orders SET status = $1 WHERE payment_intent_id = $2', ['paid', paymentIntent.id]);
    // }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("stripe-webhook error", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 400 },
    );
  }
}
