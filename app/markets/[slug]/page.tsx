import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MARKET_BY_SLUG } from "@/lib/markets";
import { marketReportForSlug } from "@/lib/market-reports";
import { getMarketMagnet } from "@/lib/market-magnets";
import { fetchMarketStats } from "@/lib/market-stats";
import { MarketLanding } from "@/components/market-landing";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const market = MARKET_BY_SLUG[slug];
  if (!market) return { title: { absolute: "Market Not Found · RVIntel" } };

  const magnet = getMarketMagnet(slug);
  return {
    title: magnet?.seo.title ?? `${market.displayName} RV Rental Market`,
    description:
      magnet?.seo.description ??
      `RV rental market intelligence for ${market.displayName} — pricing trends and competitive benchmarks.`,
    alternates: {
      canonical: `/markets/${slug}`,
    },
  };
}

export default async function MarketSlugPage({ params }: Props) {
  const { slug } = await params;
  const market = MARKET_BY_SLUG[slug];
  if (!market?.isLive) notFound();

  const magnet = getMarketMagnet(slug);
  const report = marketReportForSlug(slug);

  let stats = {
    listingCount: 0,
    avgRate: null as number | null,
    medianRate: null as number | null,
    outdoorsyCount: 0,
    rvshareCount: 0,
  };

  if (magnet) {
    stats = {
      listingCount: magnet.listingCount,
      avgRate: magnet.avgRate,
      medianRate: magnet.medianRate,
      outdoorsyCount: magnet.outdoorsyCount,
      rvshareCount: magnet.rvshareCount,
    };
  } else {
    try {
      stats = await fetchMarketStats(slug);
    } catch {
      // RPC unavailable or empty — landing page still renders
    }
  }

  return (
    <MarketLanding
      slug={slug}
      displayName={market.displayName}
      region={market.region}
      radiusMiles={market.radiusMiles}
      stats={stats}
      hasDiscovery={Boolean(market.outdoorsyAddress && market.rvshareLocation)}
      magnet={magnet}
      report={report}
    />
  );
}
