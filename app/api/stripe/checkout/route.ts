import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe"; // wherever you init Stripe
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader"; // your helper

export const runtime = "nodejs";

const BodySchema = z.object({}); // no client input needed

async function requireUserId(req: Request) {
  const supa = supabaseFromAuthHeader(req);
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user.id;
}

export async function POST(req: Request) {
  let authedUserId: string;
  try {
    authedUserId = await requireUserId(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Consume body to avoid edge cases; keep schema empty
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const priceId = process.env.STRIPE_PRICE_ID!;
  if (!priceId) {
    return NextResponse.json({ error: "Missing STRIPE_PRICE_ID" }, { status: 500 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/billing/cancel`,
    client_reference_id: authedUserId,
    metadata: { userId: authedUserId },
  });

  return NextResponse.json({ url: session.url });
}
