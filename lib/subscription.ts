// A shared helper that checks whether a user profile grants dashboard access.
// Import and call hasActiveAccess(profile) anywhere you need to gate content.

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

  // Paid subscription is live
  if (profile.subscription_status === "active") return true;

  // Free trial is still running
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
 * Returns how many days remain in the free trial (0 if expired or not on trial).
 * Useful for showing a "X days left in your trial" banner.
 */
export function trialDaysRemaining(profile: UserProfile | null): number {
  if (!profile?.trial_ends_at) return 0;
  const msRemaining = new Date(profile.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}
