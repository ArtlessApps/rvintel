// app/upgrade/page.tsx
// Three-plan upgrade page. Each Subscribe button passes its plan name
// to /api/stripe/checkout, which uses the right Stripe price ID.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";

type Plan = "solo" | "growth" | "fleet";

const PLANS = [
  {
    key: "solo" as Plan,
    label: "RVIntel One",
    price: "$9.99",
    subtitle: "Track 1 RV",
    features: ["All 33 US markets", "Daily price updates", "Rate trends & history", "1 RV in fleet tracker"],
    missing: ["Multiple RVs", "Comp-sets"],
    featured: false,
  },
  {
    key: "growth" as Plan,
    label: "Growth",
    price: "$19.99",
    subtitle: "Track up to 5 RVs",
    features: ["All 33 US markets", "Daily price updates", "Rate trends & history", "Up to 5 RVs in fleet", "Comp-sets (coming soon)"],
    missing: ["Occupancy data"],
    featured: true,
  },
  {
    key: "fleet" as Plan,
    label: "Fleet",
    price: "$39.99",
    subtitle: "Unlimited RVs",
    features: ["All 33 US markets", "Daily price updates", "Rate trends & history", "Unlimited RVs in fleet", "Comp-sets (coming soon)", "Occupancy data (coming soon)"],
    missing: [],
    featured: false,
  },
];

export default function UpgradePage() {
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubscribe(plan: Plan) {
    setLoading(plan);
    setError(null);
    try {
      // Pass the selected plan to the checkout route.
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const { url, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      window.location.href = url; // → Stripe hosted checkout page
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/" className="inline-flex items-center">
          <Logo />
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Choose your plan
          </h1>
          <p className="text-sm text-muted-foreground">
            Your trial has ended. Subscribe to keep your market edge.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-lg p-6 space-y-4 ${
                plan.featured
                  ? "border-2 border-primary"
                  : "border border-border"
              }`}
            >
              {/* Most popular badge */}
              {plan.featured && (
                <span className="inline-block text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-md">
                  Most popular
                </span>
              )}

              <div>
                <p className="text-sm text-muted-foreground">{plan.label}</p>
                <p className="text-3xl font-semibold mt-1">
                  {plan.price}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{plan.subtitle}</p>
              </div>

              {/* Features */}
              <ul className="text-sm text-muted-foreground space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
                {plan.missing.map((f) => (
                  <li key={f} className="flex items-start gap-2 opacity-40">
                    <span className="mt-0.5">—</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.key)}
                disabled={loading !== null}
                className="w-full rounded-md py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading === plan.key ? "Redirecting…" : `Get ${plan.label}`}
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Secure payment via Stripe · Cancel anytime
        </p>

        <button
          onClick={() => router.push("/login")}
          className="text-sm text-muted-foreground hover:underline"
        >
          Sign in with a different account
        </button>
      </main>
    </div>
  );
}