import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader";

export const runtime = "nodejs";

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

  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", authedUserId)
    .maybeSingle();


  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.stripe_customer_id) {
    return NextResponse.json({ error: "No customer on file" }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${process.env.APP_URL}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
