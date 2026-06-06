import Link from "next/link";
import { MapPin, ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import type { MarketStats } from "@/lib/market-stats";

type Props = {
  slug: string;
  displayName: string;
  region: string;
  radiusMiles: number;
  stats: MarketStats;
  hasDiscovery: boolean;
};

function fmtMoney(n: number | null) {
  return n === null ? "—" : `$${n}`;
}

export function MarketLanding({
  slug,
  displayName,
  region,
  radiusMiles,
  stats,
  hasDiscovery,
}: Props) {
  const hasData = stats.listingCount > 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="pt-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <Link
          href="/markets"
          className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground font-medium transition-colors mb-8"
        >
          ← All markets
        </Link>

        <div className="relative rounded-sm overflow-hidden bg-muted/30 p-8 sm:p-10 mb-8">
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-sm"
            style={{ background: "linear-gradient(180deg, #006b5f, #2dd4bf)" }}
          />
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-primary">
              {region} · {radiusMiles} mi radius
            </span>
          </div>
          <h1 className="text-[2rem] sm:text-[2.5rem] font-semibold tracking-tight mb-3">
            {displayName} RV Rental Market
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            {hasDiscovery
              ? "Live geo-scoped pricing across Outdoorsy and RVshare. Dashboard updates as discovery crons run."
              : "Display market — inventory is drawn from overlapping discovery sweeps (LA / Bay Area)."}
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Active listings", value: hasData ? stats.listingCount.toLocaleString() : "—" },
            { label: "Avg / night", value: fmtMoney(stats.avgRate) },
            { label: "Median / night", value: fmtMoney(stats.medianRate) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-muted/30 rounded-sm p-5">
              <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-muted-foreground font-medium mb-1">
                {label}
              </div>
              <div className="text-[1.5rem] font-semibold tracking-tight">{value}</div>
            </div>
          ))}
        </div>

        {hasData && (
          <div className="flex items-center gap-6 text-sm text-muted-foreground mb-8">
            <span className="inline-flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Outdoorsy: {stats.outdoorsyCount.toLocaleString()}
            </span>
            <span>RVshare: {stats.rvshareCount.toLocaleString()}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="rounded-sm"
            style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
            disabled={!hasData}
          >
            <Link href={`/dashboard?market=${slug}`}>
              Open dashboard <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>

        {!hasData && (
          <p className="text-sm text-muted-foreground mt-6">
            Discovery backfill in progress — check back after the first cron sweep completes.
          </p>
        )}
      </main>
    </div>
  );
}
