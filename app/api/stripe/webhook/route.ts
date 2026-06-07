// Stripe calls this URL automatically after payment events.
// It updates user_profiles so the app reflects the current subscription state.

import { headers } from "next/headers";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const periodEnd = sub.items.data[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

async function syncSubscription(sub: Stripe.Subscription, userId?: string) {
  const payload = {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    subscription_tier: sub.status === "active" ? "solo" : "none",
    current_period_end: subscriptionPeriodEnd(sub),
  };

  if (userId) {
    await supabaseAdmin.from("user_profiles").update(payload).eq("id", userId);
    return;
  }

  await supabaseAdmin
    .from("user_profiles")
    .update(payload)
    .eq("stripe_customer_id", sub.customer as string);
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.text();
  const sig = (await headers()).get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) break;

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const userId = session.metadata?.supabase_uid;
      await syncSubscription(sub, userId);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      await supabaseAdmin
        .from("user_profiles")
        .update({
          subscription_status: "canceled",
          subscription_tier: "none",
          stripe_subscription_id: null,
        })
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
