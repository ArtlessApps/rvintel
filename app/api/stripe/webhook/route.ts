// app/api/stripe/webhook/route.ts
// Updated to support 3 plans: solo, growth, fleet.
// The PRICE_TO_TIER map is the only thing that connects a Stripe payment
// to the right subscription tier in your database.

import { headers } from "next/headers";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Maps each Stripe price ID to its plan name.
// When Stripe fires an event, we look up the price_id here to know
// which tier to write into user_profiles.subscription_tier.
const PRICE_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_ID_SOLO!]:   'solo',
  [process.env.STRIPE_PRICE_ID_GROWTH!]: 'growth',
  [process.env.STRIPE_PRICE_ID_FLEET!]:  'fleet',
};

function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const periodEnd = sub.items.data[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = (await headers()).get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  switch (event.type) {

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;

      // Get the price ID from the subscription to know which plan this is.
      const priceId = sub.items.data[0]?.price?.id ?? '';
      const tier = PRICE_TO_TIER[priceId] ?? 'solo'; // default to solo if unknown

      await supabaseAdmin
        .from("user_profiles")
        .update({
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,   // 'active', 'past_due', etc.
          subscription_tier: sub.status === "active" ? tier : "none",
          current_period_end: subscriptionPeriodEnd(sub),
        })
        .eq("stripe_customer_id", sub.customer as string);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await supabaseAdmin
        .from("user_profiles")
        .update({ subscription_status: "canceled", subscription_tier: "none", stripe_subscription_id: null })
        .eq("stripe_customer_id", sub.customer as string);
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      await supabaseAdmin
        .from("user_profiles")
        .update({ subscription_status: "past_due" })
        .eq("stripe_customer_id", inv.customer as string);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}