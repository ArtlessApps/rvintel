import type { User } from "@supabase/supabase-js";
import { STRIPE_TRIAL_DAYS, TRIAL_SUBTEXT } from "@/lib/stripe-subscription";
import {
  hadLapsedSubscription,
  hasActiveAccess,
  trialDaysRemaining,
  type UserProfile,
} from "@/lib/subscription";

export type ProductCtaVariant = "trial" | "dashboard" | "resubscribe";

export type ProductCta = {
  href: string;
  label: string;
  subtext: string | null;
  variant: ProductCtaVariant;
};

/** Maps auth + subscription state to the primary marketing CTA (Linear/Stripe pattern). */
export function resolveProductCta(
  user: User | null,
  profile: UserProfile | null
): ProductCta {
  if (!user) {
    return {
      href: "/login?next=/upgrade",
      label: `Start ${STRIPE_TRIAL_DAYS}-day free trial`,
      subtext: TRIAL_SUBTEXT,
      variant: "trial",
    };
  }

  if (hasActiveAccess(profile)) {
    const daysLeft = trialDaysRemaining(profile);
    return {
      href: "/dashboard",
      label: "Go to dashboard",
      subtext:
        daysLeft > 0
          ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial`
          : null,
      variant: "dashboard",
    };
  }

  if (hadLapsedSubscription(profile)) {
    return {
      href: "/upgrade?expired=1",
      label: "Resubscribe",
      subtext: "Your access has ended. Pick a plan to continue.",
      variant: "resubscribe",
    };
  }

  return {
    href: "/upgrade",
    label: `Start ${STRIPE_TRIAL_DAYS}-day free trial`,
    subtext: TRIAL_SUBTEXT,
    variant: "trial",
  };
}
