console.log("STRIPE WEBHOOK HIT:", req.method);

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err?.message}` }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Handle the minimum set for subscriptions
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.client_reference_id; // we set this in checkout route
    const customerId = session.customer as string;

    if (userId && customerId) {
      await db.from("billing_customers").upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        subscription_status: "active",
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;

    await db.from("billing_customers").update({
      subscription_status: sub.status,
      price_id: sub.items.data[0]?.price?.id ?? null,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("stripe_customer_id", customerId);
  }

  return NextResponse.json({ received: true });
}
