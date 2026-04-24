import Link from "next/link";
import { MapPin, TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

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
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-[20px] border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center">
              <Logo />
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link
                href="/#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </Link>
              <Link
                href="/markets"
                className="text-sm text-foreground font-medium"
              >
                Markets
              </Link>
              <Link
                href="/learn"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Learn
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            </nav>
            <Button variant="outline" size="sm" className="hidden sm:flex" asChild>
              <Link href="/#waitlist">Join Waitlist</Link>
            </Button>
          </div>
        </div>
      </header>

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
              Deep-dive pricing analysis and demand signals for every major RV rental market in the US — updated weekly from live platform data.
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

        {/* Region grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
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
