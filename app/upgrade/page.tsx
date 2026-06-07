// The paywall page users land on when their trial expires.
// The Subscribe button calls our /api/stripe/checkout route and redirects
// to Stripe's hosted payment page.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubscribe() {
    setLoading(true);
    setError(null);

    try {
      // Ask our API route to create a Stripe Checkout session.
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Checkout failed");
      }

      // Redirect to Stripe's hosted payment page.
      // After payment, Stripe sends the user to /api/stripe/complete → /dashboard
      window.location.href = data.url;

    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 py-6">
        <Link href="/" className="inline-flex items-center">
          <Logo />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md space-y-6">

          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Your trial has ended
            </h1>
            <p className="text-sm text-muted-foreground">
              Subscribe to continue accessing RVIntel market intelligence.
            </p>
          </div>

          {/* Pricing card */}
          <div className="border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">Solo Host</span>
              <span className="text-2xl font-semibold">
                $39
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </span>
            </div>

            {/* Feature list — update these to match your actual features */}
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Live pricing for all 33 US markets
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Market trends and rate averages
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Comp-set analysis (coming soon)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                Occupancy benchmarking (coming soon)
              </li>
            </ul>

            {/* Error message */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Subscribe button */}
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-md py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Redirecting to Stripe…" : "Subscribe — $39/mo"}
            </button>

            <p className="text-xs text-center text-muted-foreground">
              Secure payment via Stripe · Cancel anytime
            </p>
          </div>

          {/* Sign out link */}
          <p className="text-center text-sm text-muted-foreground">
            Wrong account?{" "}
            <button
              onClick={() => router.push("/login")}
              className="underline hover:no-underline"
            >
              Sign in with a different email
            </button>
          </p>

        </div>
      </main>
    </div>
  );
}
