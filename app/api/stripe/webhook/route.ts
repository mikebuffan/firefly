import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCustomerId(sub: any): string | null {
  const c = sub?.customer;
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && typeof c.id === "string") return c.id;
  return null;
}

function getCurrentPeriodEnd(sub: any): number | null {
  // Stripe uses current_period_end (unix seconds) on most subscription objects
  const v = sub?.current_period_end;
  return typeof v === "number" ? v : null;
}

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
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err?.message}` },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const authedUserId = session.client_reference_id ?? null; // you set this in checkout route
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null;

    if (authedUserId && customerId) {
      await db.from("billing_customers").upsert({
        user_id: authedUserId,
        stripe_customer_id: customerId,
        subscription_status: "active",
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ received: true });
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;

    const customerId = sub.customer as string;

    // Stripe typing mismatch happens across versions/events — don't let TS block deploy.
    const currentPeriodEnd = (sub as any).current_period_end as number | undefined;

    await db
      .from("billing_customers")
      .update({
        subscription_status: sub.status,
        price_id: sub.items?.data?.[0]?.price?.id ?? null,
        current_period_end: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_customer_id", customerId);
  }

  // Ignore all other event types for now
  return NextResponse.json({ received: true });
}
