// app/api/stripe/webhook/route.ts
// Syncs subscription lifecycle events → user_profiles (solo / growth / fleet tiers).

import { headers } from "next/headers";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { profileFromStripeSubscription } from "@/lib/stripe-subscription";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service credentials are not configured");
  }
  return createClient(url, serviceKey);
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();
    const webhookSecret = getWebhookSecret();

    const body = await request.text();
    const sig = (await headers()).get("stripe-signature");
    if (!sig) {
      console.error("stripe webhook: missing stripe-signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "signature verification failed";
      console.error("stripe webhook: invalid signature", message);
      return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const { error } = await supabaseAdmin
          .from("user_profiles")
          .update(profileFromStripeSubscription(sub))
          .eq("stripe_customer_id", sub.customer as string);

        if (error) {
          console.error(
            "stripe webhook: subscription sync failed",
            event.id,
            sub.id,
            error.message
          );
          return NextResponse.json({ error: "Database update failed" }, { status: 500 });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { error } = await supabaseAdmin
          .from("user_profiles")
          .update({
            subscription_status: "canceled",
            subscription_tier: "none",
            stripe_subscription_id: null,
            trial_ends_at: null,
          })
          .eq("stripe_customer_id", sub.customer as string);

        if (error) {
          console.error(
            "stripe webhook: subscription delete failed",
            event.id,
            sub.id,
            error.message
          );
          return NextResponse.json({ error: "Database update failed" }, { status: 500 });
        }
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const { error } = await supabaseAdmin
          .from("user_profiles")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", inv.customer as string);

        if (error) {
          console.error(
            "stripe webhook: payment_failed sync failed",
            event.id,
            inv.id,
            error.message
          );
          return NextResponse.json({ error: "Database update failed" }, { status: 500 });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed";
    console.error("stripe webhook: unhandled error", message);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
