"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase";
import { liveMarkets } from "@/lib/markets";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Zap,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  MapPin,
} from "lucide-react";

const LIVE_MARKET_COUNT = liveMarkets().length;
const REGION_COUNT = new Set(liveMarkets().map((m) => m.region)).size;

function BrowserWindow({
  url,
  children,
  className = "",
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={`relative bg-card rounded-2xl border border-border shadow-[0_12px_40px_rgba(25,28,30,0.08)] overflow-hidden ${className}`}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border"
        aria-hidden
      >
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-green-400/80" />
        </div>
        <div className="flex-1 mx-4 min-w-0">
          <div className="bg-background rounded-md px-3 py-1.5 text-xs text-muted-foreground max-w-md mx-auto text-center truncate">
            {url}
          </div>
        </div>
      </div>
      {children}
    </figure>
  );
}

function HeroProductVisual() {
  return (
    <div className="relative w-full max-w-xl mx-auto lg:max-w-none">
      <div
        className="absolute -inset-3 sm:-inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-3xl blur-2xl opacity-70"
        aria-hidden
      />
      <BrowserWindow url="app.rvintel.io/dashboard">
        <figcaption className="sr-only">
          RVIntel Market Dashboard with rate distribution, average market rate,
          and rate trend analytics
        </figcaption>
        <Image
          src="/images/Dashboard.png"
          alt="RVIntel Market Dashboard showing average market rate, rate distribution, and rate trend over time for Class B RVs in San Diego"
          className="block w-full h-auto"
          width={1357}
          height={861}
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </BrowserWindow>
    </div>
  );
}

export function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      await supabase.from("waitlist").insert({ email });
    } finally {
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader priorityLogo />

      <main id="main-content">
        <section
          aria-labelledby="hero-heading"
          className="relative pt-28 pb-16 sm:pt-32 sm:pb-20 px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid gap-12 lg:gap-14 lg:grid-cols-2 lg:items-center">
              <div className="flex flex-col justify-center text-center lg:text-left order-2 lg:order-1">
                <h1
                  id="hero-heading"
                  className="text-3xl sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1] font-bold text-foreground tracking-tight text-balance mb-3"
                >
                  RV Rental Market Intelligence
                </h1>
                <p className="text-xl sm:text-2xl font-semibold text-foreground/90 tracking-tight text-balance mb-6">
                  Stop Leaving Money on the Table
                </p>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 mx-auto lg:mx-0 w-fit">
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{LIVE_MARKET_COUNT} Markets Live Nationwide</span>
                </div>

                <p className="text-base sm:text-lg text-muted-foreground leading-relaxed text-pretty max-w-xl mx-auto lg:mx-0 mb-8">
                  The average RV owner underprices by 18% on peak weekends. RVIntel tracks supply, demand, and competitor rates across {REGION_COUNT} US regions — from San Diego to Seattle — so you never guess again.
                </p>

                <div id="waitlist" className="max-w-md mx-auto lg:mx-0 w-full">
                  {!submitted ? (
                    <form
                      onSubmit={handleSubmit}
                      className="flex flex-col sm:flex-row gap-3"
                    >
                      <Input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="flex-1 h-12 bg-background border-border"
                      />
                      <Button
                        type="submit"
                        disabled={loading}
                        className="h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shrink-0"
                      >
                        {loading ? (
                          "Joining..."
                        ) : (
                          <>
                            Get Early Access
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-center lg:justify-start gap-3 p-4 bg-primary/10 rounded-xl">
                      <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
                      <p className="text-foreground font-medium text-left">
                        {"You're on the list! We'll be in touch soon."}
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-4">
                    Be among the first to get access. No spam, ever.
                  </p>
                </div>
              </div>

              <div className="order-1 lg:order-2 min-w-0">
                <HeroProductVisual />
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="coverage-heading"
          className="py-14 px-4 sm:px-6 lg:px-8 bg-muted/40"
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10">
              <h2
                id="coverage-heading"
                className="text-2xl sm:text-3xl font-bold text-foreground mb-3"
              >
                Coast-to-Coast Market Intelligence
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Live pricing data across California, the Mountain West, Southwest, Southeast,
                Midwest, Northeast, and Pacific Northwest.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto mb-10">
              {[
                { icon: MapPin, label: "Live markets", value: String(LIVE_MARKET_COUNT) },
                { icon: BarChart3, label: "Regions", value: String(REGION_COUNT) },
                { icon: TrendingUp, label: "Listings tracked", value: "26,000+" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="text-center p-6 bg-background/60 rounded-sm">
                  <div className="w-10 h-10 bg-primary/10 rounded-sm flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mb-1">
                    {label}
                  </div>
                  <div className="text-2xl font-semibold tracking-tight">{value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button
                asChild
                variant="outline"
                className="rounded-sm"
              >
                <Link href="/markets">Browse all markets</Link>
              </Button>
              <Button
                asChild
                className="rounded-sm"
                style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
              >
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Market Intelligence That Pays for Itself
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Stop guessing. Start earning what your RV is actually worth.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: DollarSign,
                  title: "Market Comps",
                  description:
                    "See exactly what comparable RVs are charging in your market. Filter by class, make, and amenities to find your true competitors.",
                },
                {
                  icon: BarChart3,
                  title: "Occupancy Signals",
                  description:
                    "Track blocked calendars and booking velocity across your local market to understand real demand before you price.",
                },
                {
                  icon: Zap,
                  title: "Event Alerts",
                  description:
                    "Get notified when high-demand events hit your area so you can raise rates at exactly the right moment.",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="group p-8 bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="preview"
          className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background to-card/50"
          aria-labelledby="preview-heading"
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 max-w-2xl mx-auto">
              <h2
                id="preview-heading"
                className="text-3xl sm:text-4xl font-bold text-foreground mb-4"
              >
                See Where Every RV Stands in Its Market
              </h2>
              <p className="text-lg text-muted-foreground">
                Track each vehicle in your fleet against its local comp set.
                Know instantly if you are priced below market — and how much
                headroom you have to raise rates.
              </p>
            </div>

            <div className="max-w-6xl mx-auto">
              <div className="relative">
                <div
                  className="absolute -inset-3 sm:-inset-4 bg-gradient-to-r from-primary/15 via-primary/5 to-primary/15 rounded-3xl blur-2xl opacity-70"
                  aria-hidden
                />
                <BrowserWindow url="app.rvintel.io/dashboard/fleet">
                  <figcaption className="sr-only">
                    My Fleet view highlighting a 2023 Ford Transit priced at
                    $99 per night — 50.3% below the $199 market median for
                    Class B RVs in Chino, CA
                  </figcaption>
                  <Image
                    src="/images/MyFleet.png"
                    alt="RVIntel My Fleet view showing a 2023 Ford Transit priced below market with a $99 nightly rate versus the $199 market median, plus overall market rate distribution and trend"
                    className="block w-full h-auto"
                    width={1767}
                    height={827}
                    sizes="(max-width: 1024px) 100vw, 80vw"
                  />
                </BrowserWindow>
              </div>
            </div>
          </div>
        </section>

        <section
          className="py-20 px-4 sm:px-6 lg:px-8"
          aria-labelledby="final-cta-heading"
        >
          <div className="max-w-3xl mx-auto text-center">
            <h2
              id="final-cta-heading"
              className="text-3xl sm:text-4xl font-bold text-foreground mb-6"
            >
              Ready to Maximize Your RV Revenue?
            </h2>
            <p className="text-lg text-muted-foreground mb-10">
              The dashboard is live across {LIVE_MARKET_COUNT} markets. Join the waitlist for full
              access and benchmark reports as we roll out.
            </p>

            {!submitted ? (
              <form
                onSubmit={handleSubmit}
                className="max-w-md mx-auto flex flex-col sm:flex-row gap-3"
              >
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="flex-1 h-12 bg-card border-border"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                >
                  {loading ? (
                    "Joining..."
                  ) : (
                    <>
                      Join Waitlist
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="inline-flex items-center gap-3 p-4 bg-primary/10 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-primary" />
                <p className="text-foreground font-medium">
                  {"You're already on the list!"}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-sm text-muted-foreground">
            © 2026 RVIntel. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
