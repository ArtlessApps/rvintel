import Link from "next/link";
import { MapPin, TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Regional Markets · RVIntel",
  description:
    "Browse RV rental market intelligence reports by region — pricing trends, demand signals, and competitive benchmarks.",
};

const REGIONS = [
  {
    name: "Southwest",
    states: "AZ · NV · NM · UT",
    status: "coming_soon",
    highlight: "Desert & canyon destinations",
  },
  {
    name: "Mountain West",
    states: "CO · WY · MT · ID",
    status: "coming_soon",
    highlight: "National park corridors",
  },
  {
    name: "Pacific Coast",
    states: "CA · OR · WA",
    status: "coming_soon",
    highlight: "Coastal & redwood routes",
  },
  {
    name: "Southeast",
    states: "FL · GA · SC · NC",
    status: "coming_soon",
    highlight: "Year-round warm-weather markets",
  },
  {
    name: "Midwest",
    states: "MN · WI · MI · OH",
    status: "coming_soon",
    highlight: "Great Lakes & seasonal peaks",
  },
  {
    name: "Northeast",
    states: "NY · VT · ME · NH",
    status: "coming_soon",
    highlight: "Fall foliage & summer escapes",
  },
];

export default function MarketsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="pt-16">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10 text-primary text-[0.6875rem] uppercase tracking-[0.05em] font-medium mb-6">
              <MapPin className="w-3 h-3" />
              Regional Intelligence
            </div>
            <h1 className="text-[3.5rem] font-semibold tracking-tight leading-none mb-4">
              Market Reports
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
              Deep-dive pricing analysis and demand signals for every major RV rental market in the US — updated quarterly from live platform data.
            </p>
          </div>
        </section>

        {/* Stats bar */}
        <section className="bg-muted/40 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-wrap gap-10">
              {[
                { icon: BarChart3, label: "Markets tracked", value: "6 Regions" },
                { icon: TrendingUp, label: "Data points", value: "10k+ listings" },
                { icon: MapPin, label: "Coverage", value: "48 states" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">{label}</div>
                    <div className="text-sm font-semibold">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── LIVE MARKETS ───────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground">
              Live Reports
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-primary">
                Data current
              </span>
            </div>
          </div>

          {/* San Diego card */}
          <Link href="/markets/san-diego" className="group block">
            <div className="relative rounded-sm overflow-hidden bg-muted/30 hover:bg-muted/50 transition-colors p-8 sm:p-10">
              {/* Gradient accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-sm"
                style={{ background: "linear-gradient(180deg, #006b5f, #2dd4bf)" }}
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                {/* Left: city info */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-primary">
                      San Diego, CA
                    </span>
                  </div>
                  <h3 className="text-[1.5rem] font-semibold tracking-tight leading-tight mb-1">
                    San Diego RV Rental Market
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Pricing benchmarks, platform breakdown, and occupancy signals across 3,357 active listings on Outdoorsy & RVshare.
                  </p>
                </div>

                {/* Right: key stats */}
                <div className="flex gap-8 shrink-0">
                  <div>
                    <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mb-1">
                      Avg / night
                    </div>
                    <div className="text-[1.5rem] font-semibold tracking-tight">$215</div>
                  </div>
                  <div>
                    <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mb-1">
                      Listings
                    </div>
                    <div className="text-[1.5rem] font-semibold tracking-tight">3,357</div>
                  </div>
                  <div>
                    <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mb-1">
                      Platforms
                    </div>
                    <div className="text-[1.5rem] font-semibold tracking-tight">2</div>
                  </div>
                </div>
              </div>

              {/* Footer row */}
              <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
                <div className="flex gap-6">
                  {[
                    { label: "Class A", value: "$325/night" },
                    { label: "Class C", value: "$249/night" },
                    { label: "Travel Trailer", value: "$145/night" },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-sm">
                      <span className="text-muted-foreground">{label} · </span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.05em] text-primary font-medium group-hover:gap-2 transition-all">
                  View full report <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          </Link>
        </section>

        {/* ── COMING SOON REGIONS ────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="mb-6">
            <h2 className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground">
              Coming Soon
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REGIONS.map((region) => (
              <div
                key={region.name}
                className="group relative bg-muted/30 hover:bg-muted/50 rounded-sm p-6 transition-colors cursor-default"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-[1.5rem] font-semibold tracking-tight leading-tight">
                      {region.name}
                    </h2>
                    <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mt-0.5">
                      {region.states}
                    </p>
                  </div>
                  <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium px-2 py-0.5 rounded-sm bg-primary/10 text-primary">
                    Soon
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{region.highlight}</p>
                <div className="mt-4 flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.05em] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Preview report <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="rounded-sm bg-muted/40 px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-[1.5rem] font-semibold tracking-tight mb-1">
                Get notified when reports launch
              </h2>
              <p className="text-sm text-muted-foreground">
                Regional market reports are rolling out to waitlist members first.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="shrink-0 rounded-sm"
              style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
            >
              <Link href="/#waitlist">Join the Waitlist</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}