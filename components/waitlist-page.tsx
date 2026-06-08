"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { SiteHeader } from "@/components/site-header";
import { StartTrialCta } from "@/components/start-trial-cta";
import { liveMarkets } from "@/lib/markets";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Zap,
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

                <div className="max-w-md mx-auto lg:mx-0 w-full">
                  <StartTrialCta size="lg" showSubtext className="flex flex-col items-center lg:items-start" />
                  <Button
                    asChild
                    variant="ghost"
                    className="mt-3 h-10 text-muted-foreground"
                  >
                    <Link href="/markets">Browse {LIVE_MARKET_COUNT} live markets</Link>
                  </Button>
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
              <Button asChild variant="outline" className="rounded-sm">
                <Link href="/markets">Browse all markets</Link>
              </Button>
              <StartTrialCta />
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
              Live data across {LIVE_MARKET_COUNT} markets. Start your free trial and price with confidence.
            </p>

            <StartTrialCta size="lg" showSubtext className="flex flex-col items-center" />
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
