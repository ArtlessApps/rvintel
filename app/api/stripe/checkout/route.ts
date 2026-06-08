// app/api/stripe/checkout/route.ts
// Accepts a `plan` parameter from /upgrade and opens the matching Stripe price.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { NextResponse } from "next/server";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function priceIdForPlan(plan: string): string {
  const map: Record<string, string | undefined> = {
    solo: process.env.STRIPE_PRICE_ID_SOLO,
    growth: process.env.STRIPE_PRICE_ID_GROWTH,
    fleet: process.env.STRIPE_PRICE_ID_FLEET,
  };
  return map[plan] ?? process.env.STRIPE_PRICE_ID_SOLO!;
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = (body.plan as string) ?? "solo";
  const priceId = priceIdForPlan(plan);

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      metadata: { supabase_uid: user.id },
    });
    customerId = customer.id;

    const supabaseAdmin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    await supabaseAdmin
      .from("user_profiles")
      .upsert({
        id: user.id,
        email: user.email,
        stripe_customer_id: customerId,
      });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/api/stripe/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/upgrade`,
    metadata: { supabase_uid: user.id, plan },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
