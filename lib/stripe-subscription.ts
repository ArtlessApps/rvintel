// Shared Stripe subscription → user_profiles mapping.

import type Stripe from "stripe";
import { PLAN_CONFIG, type PlanKey } from "@/lib/subscription";

/** Free trial length for new self-serve signups (days). */
export const STRIPE_TRIAL_DAYS = 7;

/** Shared marketing copy for no-card trial CTAs. */
export const TRIAL_SUBTEXT =
  "No credit card required · From $9.99/mo after trial · Cancel anytime";

export function buildPriceToTierMap(): Record<string, PlanKey> {
  const map: Record<string, PlanKey> = {};
  if (process.env.STRIPE_PRICE_ID_SOLO) {
    map[process.env.STRIPE_PRICE_ID_SOLO] = "solo";
  }
  if (process.env.STRIPE_PRICE_ID_GROWTH) {
    map[process.env.STRIPE_PRICE_ID_GROWTH] = "growth";
  }
  if (process.env.STRIPE_PRICE_ID_FLEET) {
    map[process.env.STRIPE_PRICE_ID_FLEET] = "fleet";
  }
  return map;
}

export function tierForPriceId(
  priceId: string,
  priceToTier: Record<string, string> = buildPriceToTierMap()
): PlanKey {
  const tier = priceToTier[priceId];
  return tier && tier in PLAN_CONFIG ? (tier as PlanKey) : "solo";
}

export function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const periodEnd = sub.items.data[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

export function profileFromStripeSubscription(sub: Stripe.Subscription) {
  const priceToTier = buildPriceToTierMap();
  const tier = tierForPriceId(sub.items.data[0]?.price?.id ?? "", priceToTier);
  const entitled = sub.status === "active" || sub.status === "trialing";

  return {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    subscription_tier: entitled ? tier : "none",
    current_period_end: subscriptionPeriodEnd(sub),
    trial_ends_at: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
  };
}

export function checkoutSessionGranted(
  session: Stripe.Checkout.Session,
  userId: string
): boolean {
  if (session.metadata?.supabase_uid !== userId) return false;
  if (session.status !== "complete") return false;
  // Trialing subscriptions may be no_payment_required until the first charge.
  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  );
}
