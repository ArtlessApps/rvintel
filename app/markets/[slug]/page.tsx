import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MARKET_BY_SLUG } from "@/lib/markets";
import { marketPageTitle, marketReportForSlug } from "@/lib/market-reports";
import { fetchMarketStats } from "@/lib/market-stats";
import { MarketReportViewer } from "@/components/market-report-viewer";
import { MarketLanding } from "@/components/market-landing";

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

  const report = marketReportForSlug(slug);
  if (report) {
    return (
      <MarketReportViewer
        reportPath={report.path}
        region={market.displayName}
        title={marketPageTitle(slug)}
        period={report.period}
        description="Pricing benchmarks, platform breakdown, and occupancy signals across active listings on Outdoorsy and RVshare. Updated quarterly."
        downloadFileName={report.fileName}
        format={report.format}
      />
    );
  }

  let stats = {
    listingCount: 0,
    avgRate: null as number | null,
    medianRate: null as number | null,
    outdoorsyCount: 0,
    rvshareCount: 0,
  };
  try {
    stats = await fetchMarketStats(slug);
  } catch {
    // RPC unavailable or empty — landing page still renders
  }

  return (
    <MarketLanding
      slug={slug}
      displayName={market.displayName}
      region={market.region}
      radiusMiles={market.radiusMiles}
      stats={stats}
      hasDiscovery={Boolean(market.outdoorsyAddress && market.rvshareLocation)}
    />
  );
}
