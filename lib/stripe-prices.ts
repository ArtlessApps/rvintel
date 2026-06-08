// Validates Stripe price env vars — Checkout requires price_ IDs, not prod_ product IDs.

const PLAN_ENV_KEYS = {
  solo: "STRIPE_PRICE_ID_SOLO",
  growth: "STRIPE_PRICE_ID_GROWTH",
  fleet: "STRIPE_PRICE_ID_FLEET",
} as const;

export type BillingPlan = keyof typeof PLAN_ENV_KEYS;

export function billingPlanEnvKey(plan: string): string {
  return PLAN_ENV_KEYS[plan as BillingPlan] ?? PLAN_ENV_KEYS.solo;
}

export function priceIdForPlan(plan: string): string | undefined {
  const map: Record<string, string | undefined> = {
    solo: process.env.STRIPE_PRICE_ID_SOLO,
    growth: process.env.STRIPE_PRICE_ID_GROWTH,
    fleet: process.env.STRIPE_PRICE_ID_FLEET,
  };
  return map[plan] ?? process.env.STRIPE_PRICE_ID_SOLO;
}

export function validateStripePriceId(
  raw: string,
  envKey: string
): string | { error: string } {
  const id = raw.trim();
  if (!id) {
    return { error: `${envKey} is not set.` };
  }
  if (id.startsWith("prod_")) {
    return {
      error: `${envKey} is a Stripe product ID (${id}). Checkout needs a price ID (price_…). In Stripe Dashboard → Product → Pricing, copy the Price ID.`,
    };
  }
  if (!id.startsWith("price_")) {
    return {
      error: `${envKey} must be a Stripe price ID starting with price_.`,
    };
  }
  return id;
}

export function resolveStripePriceId(
  plan: string
): { priceId: string } | { error: string } {
  const envKey = billingPlanEnvKey(plan);
  const raw = priceIdForPlan(plan);
  if (!raw) {
    return { error: `Billing is not configured for the ${plan} plan (${envKey} missing).` };
  }
  const validated = validateStripePriceId(raw, envKey);
  if (typeof validated === "object") {
    return validated;
  }
  return { priceId: validated };
}
