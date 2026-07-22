"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type WaitlistSignupProps = {
  title?: string;
  description?: string;
  className?: string;
};

export function WaitlistSignup({
  title = "Don't see your market listed?",
  description = "Tell us which metro you want next — we'll email you when it goes live.",
  className = "",
}: WaitlistSignupProps) {
  const [email, setEmail] = useState("");
  const [market, setMarket] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedMarket = market.trim();
    if (!trimmedEmail || !trimmedMarket) return;

    setLoading(true);
    try {
      await supabase.from("waitlist").insert({
        email: trimmedEmail,
        market: trimmedMarket,
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <h2 className="text-[1.5rem] font-semibold tracking-tight mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-lg">{description}</p>

      {!submitted ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-md">
          <Input
            type="text"
            placeholder="City or metro you want opened"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            required
            autoComplete="address-level2"
            aria-label="Market you'd like to see open"
            className="h-11 bg-background border-border"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="flex-1 h-11 bg-background border-border"
            />
            <Button
              type="submit"
              disabled={loading}
              variant="outline"
              className="h-11 shrink-0 rounded-sm"
            >
              {loading ? "Joining…" : "Join waitlist"}
              {!loading ? <ArrowRight className="w-4 h-4 ml-2" /> : null}
            </Button>
          </div>
        </form>
      ) : (
        <div className="inline-flex items-center gap-3 p-4 bg-primary/10 rounded-sm max-w-md">
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
          <p className="text-sm text-foreground font-medium">
            You&apos;re on the list — we&apos;ll email you when {market.trim()} is added.
          </p>
        </div>
      )}
    </div>
  );
}
