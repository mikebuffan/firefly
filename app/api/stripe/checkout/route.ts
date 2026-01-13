import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { requireUser } from "@firefly/shared/lib/auth/requireUser";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const Body = z.object({
  priceId: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { authedUserId } = await requireUser(req);
  const { priceId } = parsed.data;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: authedUserId,
    metadata: { authedUserId },
    subscription_data: { metadata: { authedUserId } },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/cancel`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
