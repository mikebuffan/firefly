// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe"; // wherever you init Stripe
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader"; // your helper

export const runtime = "nodejs";

const BodySchema = z.object({
  priceId: z.string().min(1),
});

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

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { priceId } = parsed.data;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // NOTE: also include success/cancel urls etc. (keeping short here)
    metadata: { userId: authedUserId },
  });

  return NextResponse.json({ url: session.url });
}
