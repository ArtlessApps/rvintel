import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { MARKET_BY_SLUG } from "@/lib/markets";
import { MarketReportViewer } from "@/components/market-report-viewer";

const REPORT_BY_SLUG: Record<string, { path: string; period: string; fileName: string }> = {
  "san-diego-ca": {
    path: "/reports/san-diego-rv-market-report-q2-2026.pdf",
    period: "Q2 2026",
    fileName: "san-diego-rv-market-report-q2-2026.pdf",
  },
};

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const market = MARKET_BY_SLUG[slug];
  if (!market) return { title: "Market Not Found · RVIntel" };
  return {
    title: `${market.displayName} RV Rental Market · RVIntel`,
    description: `RV rental market intelligence for ${market.displayName} — pricing trends and competitive benchmarks.`,
  };
}

export default async function MarketSlugPage({ params }: Props) {
  const { slug } = await params;
  const market = MARKET_BY_SLUG[slug];
  if (!market?.isLive) notFound();

  const report = REPORT_BY_SLUG[slug];

  if (report) {
    return (
      <MarketReportViewer
        reportPath={report.path}
        region={market.displayName}
        title={`${market.displayName} RV Rental Market Report`}
        period={report.period}
        description="Pricing benchmarks, platform breakdown, and occupancy signals across active listings on Outdoorsy and RVshare. Updated quarterly."
        downloadFileName={report.fileName}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="pt-16 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="text-[0.6875rem] uppercase tracking-[0.05em] font-medium text-primary">
            {market.region}
          </span>
        </div>
        <h1 className="text-[2rem] font-semibold tracking-tight mb-3">
          {market.displayName} RV Rental Market
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          Live pricing data for this geo market is available on the dashboard. A quarterly PDF report
          will publish once initial discovery collection completes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="rounded-sm"
            style={{ background: "linear-gradient(135deg, #006b5f, #2dd4bf)" }}
          >
            <Link href={`/dashboard?market=${slug}`}>
              Open dashboard <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-sm">
            <Link href="/markets">All markets</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
