// lib/subscription.ts

// ── Plan definitions ──────────────────────────────────────────────────────────
// Single source of truth for tier names, prices, and fleet limits.
// The webhook uses this to map Stripe price IDs → tier names.
// The fleet add API uses this to enforce how many RVs each plan allows.

export const PLAN_CONFIG = {
  solo:   { label: 'RVIntel One', priceDisplay: '$9.99',  rvLimit: 1,         stripeEnvKey: 'STRIPE_PRICE_ID_SOLO'   },
  growth: { label: 'Growth', priceDisplay: '$19.99', rvLimit: 5,         stripeEnvKey: 'STRIPE_PRICE_ID_GROWTH' },
  fleet:  { label: 'Fleet',  priceDisplay: '$39.99', rvLimit: Infinity,  stripeEnvKey: 'STRIPE_PRICE_ID_FLEET'  },
} as const;

export type PlanKey = keyof typeof PLAN_CONFIG;

const ENTITLED_STRIPE_STATUSES = new Set(["active", "trialing"]);

/**
 * Returns how many RVs this subscription tier allows.
 * Returns 0 if the tier is unrecognised (e.g. 'none' or null = no access).
 */
export function getFleetLimit(tier: string | null): number {
  if (!tier || !(tier in PLAN_CONFIG)) return 0;
  return PLAN_CONFIG[tier as PlanKey].rvLimit;
}

// ── Access helpers ────────────────────────────────────────────────────────────

export type UserProfile = {
  subscription_tier: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

function hasEntitledTier(profile: UserProfile): boolean {
  return (
    profile.subscription_tier !== null &&
    profile.subscription_tier !== "none" &&
    profile.subscription_tier in PLAN_CONFIG
  );
}

/**
 * Returns true if the user should have access to the dashboard.
 * Access is granted if:
 *   (a) Stripe subscription is active or in a free trial (trialing), OR
 *   (b) Legacy waitlist manual trial (admin activate with trial_days) hasn't expired.
 */
export function hasActiveAccess(profile: UserProfile | null): boolean {
  if (!profile) return false;

  if (
    profile.subscription_status &&
    ENTITLED_STRIPE_STATUSES.has(profile.subscription_status) &&
    hasEntitledTier(profile)
  ) {
    return true;
  }

  // Legacy waitlist-only manual trial (optional via /api/admin/activate).
  if (
    profile.subscription_tier === "trial" &&
    profile.trial_ends_at &&
    new Date(profile.trial_ends_at) > new Date()
  ) {
    return true;
  }

  return false;
}

/**
 * True when the user previously had (or attempted) a subscription and no longer has access.
 * Default profile rows (tier/status `none`, no trial history) are treated as new signups.
 */
export function hadLapsedSubscription(profile: UserProfile | null): boolean {
  if (!profile || hasActiveAccess(profile)) return false;

  const { subscription_status, subscription_tier, trial_ends_at } = profile;

  if (
    subscription_status === "none" &&
    subscription_tier === "none" &&
    !trial_ends_at
  ) {
    return false;
  }

  return true;
}

/**
 * Days left in the current Stripe or legacy trial (0 if not trialing).
 */
export function trialDaysRemaining(profile: UserProfile | null): number {
  if (!profile?.trial_ends_at) return 0;
  if (
    profile.subscription_status !== "trialing" &&
    profile.subscription_tier !== "trial"
  ) {
    return 0;
  }
  const ms = new Date(profile.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
