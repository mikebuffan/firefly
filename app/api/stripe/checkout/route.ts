import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { requireUser } from "@/lib/auth/requireUser";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  //apiVersion: "2024-06-20",
});

const Body = z.object({
  priceId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId } = await requireUser(req);

  const { priceId } = parsed.data;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],

    // If Customer IDs are stored, look up by userId here and set `customer`
    metadata: { userId },
    subscription_data: {
      metadata: { userId },
    },

    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/cancel`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
