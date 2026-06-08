import Link from "next/link";
import { MapPin, TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { StartTrialCta } from "@/components/start-trial-cta";
import { WaitlistSignup } from "@/components/waitlist-signup";
import { liveMarkets } from "@/lib/markets";

export const metadata = {
  title: "RV Rental Market Reports by City",
  description:
    "Browse RV rental market intelligence reports by region — pricing trends, demand signals, and competitive benchmarks across 33 US metros.",
  alternates: {
    canonical: "/markets",
  },
};

export default function MarketsPage() {
  const markets = liveMarkets();
  const byRegion = markets.reduce((acc, m) => {
    const list = acc.get(m.region) ?? [];
    list.push(m);
    acc.set(m.region, list);
    return acc;
  }, new Map<string, typeof markets>());

  const discoveryCount = markets.filter((m) => m.outdoorsyAddress && m.rvshareLocation).length;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="pt-16">
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
              Deep-dive pricing analysis and demand signals for major RV rental markets across the US
              — geo-scoped from live platform data.
            </p>
          </div>
        </section>

        <section className="bg-muted/40 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-wrap gap-10">
              {[
                { icon: BarChart3, label: "Markets tracked", value: `${markets.length} live` },
                { icon: TrendingUp, label: "Discovery anchors", value: `${discoveryCount} crons` },
                { icon: MapPin, label: "Regions", value: `${byRegion.size} regions` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium">
                      {label}
                    </div>
                    <div className="text-sm font-semibold">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 space-y-14">
          {[...byRegion.entries()].map(([region, regionMarkets]) => (
            <div key={region}>
              <h2 className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-muted-foreground mb-4">
                {region}
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {regionMarkets.map((m) => (
                  <Link
                    key={m.slug}
                    href={`/markets/${m.slug}`}
                    className="group relative bg-muted/30 hover:bg-muted/50 rounded-sm p-6 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-[1.25rem] font-semibold tracking-tight leading-tight">
                          {m.displayName}
                        </h3>
                        <p className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mt-0.5">
                          {m.radiusMiles} mi radius
                        </p>
                      </div>
                      <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium px-2 py-0.5 rounded-sm bg-primary/10 text-primary">
                        Live
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {m.outdoorsyAddress
                        ? "Discovery + dashboard data"
                        : "Display market — shares overlapping discovery"}
                    </p>
                    <div className="mt-4 flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.05em] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      View market <ArrowRight className="w-3 h-3" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="rounded-sm bg-muted/40 px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-[1.5rem] font-semibold tracking-tight mb-1">
                Explore live pricing data
              </h2>
              <p className="text-sm text-muted-foreground">
                The dashboard queries each market by geographic radius — no double-counting across overlapping metros.
              </p>
            </div>
            <StartTrialCta />
          </div>
        </section>

        <section id="expansion-waitlist" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 border-t border-border pt-16">
          <WaitlistSignup />
        </section>
      </main>
    </div>
  );
}
