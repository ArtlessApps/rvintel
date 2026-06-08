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

/**
 * Returns how many RVs this subscription tier allows.
 * Returns 0 if the tier is unrecognised (e.g. 'none' or null = no access).
 */
export function getFleetLimit(tier: string | null): number {
  if (tier === "trial") return PLAN_CONFIG.solo.rvLimit;
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

/**
 * Returns true if the user should have access to the dashboard.
 * Access is granted if:
 *   (a) They have an active paid Stripe subscription, OR
 *   (b) They're on a free trial and the trial hasn't expired yet.
 */
export function hasActiveAccess(profile: UserProfile | null): boolean {
  if (!profile) return false;

  // Active paid subscription
  if (profile.subscription_status === 'active') return true;

  // Trial still running
  if (
    profile.subscription_tier === 'trial' &&
    profile.trial_ends_at &&
    new Date(profile.trial_ends_at) > new Date()
  ) return true;

  return false;
}

/**
 * Returns how many days remain in the free trial (0 if expired or not on trial).
 * Use this to show a "X days left in your trial" banner.
 */
export function trialDaysRemaining(profile: UserProfile | null): number {
  if (!profile?.trial_ends_at) return 0;
  const ms = new Date(profile.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}