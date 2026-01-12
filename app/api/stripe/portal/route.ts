import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { requireUserId } from "@/lib/auth/requireUser";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let authedUserId: string;
  try {
    authedUserId = await requireUserId(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", authedUserId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.stripe_customer_id)
    return NextResponse.json({ error: "No customer on file" }, { status: 400 });

  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
