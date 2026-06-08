// app/api/stripe/checkout/route.ts
// Accepts a `plan` parameter from /upgrade and opens the matching Stripe price.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { NextResponse } from "next/server";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured on this server.");
  }
  return new Stripe(key);
}

function priceIdForPlan(plan: string): string | undefined {
  const map: Record<string, string | undefined> = {
    solo: process.env.STRIPE_PRICE_ID_SOLO,
    growth: process.env.STRIPE_PRICE_ID_GROWTH,
    fleet: process.env.STRIPE_PRICE_ID_FLEET,
  };
  return map[plan] ?? process.env.STRIPE_PRICE_ID_SOLO;
}

function adminClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

async function saveCustomerId(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  userId: string,
  email: string | undefined,
  customerId: string
) {
  const supabaseAdmin = adminClient(cookieStore);
  const { error } = await supabaseAdmin.from("user_profiles").upsert({
    id: userId,
    email,
    stripe_customer_id: customerId,
  });
  if (error) {
    console.error("checkout: failed to save stripe_customer_id", error.message);
  }
}

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = (body.plan as string) ?? "solo";
    const priceId = priceIdForPlan(plan);

    if (!priceId) {
      return NextResponse.json(
        { error: `Billing is not configured for the ${plan} plan.` },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      return NextResponse.json(
        { error: "Site URL is not configured on this server." },
        { status: 500 }
      );
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id ?? null;

    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { supabase_uid: user.id },
      });
      customerId = customer.id;
      await saveCustomerId(cookieStore, user.id, user.email, customerId);
    }

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
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Stripe.errors.StripeError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Checkout failed";

    console.error("checkout error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
