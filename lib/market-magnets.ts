import magnetsBundle from "@/lib/generated/market-magnets.json";

export type MarketMagnetClassRow = {
  class: string;
  label: string;
  count: number;
  medianRate: number | null;
};

export type MarketMagnetFaq = {
  question: string;
  answer: string;
};

export type MarketMagnetSeo = {
  title: string;
  description: string;
  introHtml: string;
  faq: MarketMagnetFaq[];
};

export type MarketMagnet = {
  slug: string;
  displayName: string;
  region: string;
  radiusMiles: number;
  asOf: string;
  asOfLabel: string;
  monthYear: string;
  listingCount: number;
  avgRate: number | null;
  medianRate: number | null;
  p25: number | null;
  p75: number | null;
  outdoorsyCount: number;
  rvshareCount: number;
  deliveryPct: number | null;
  instantBookPct: number | null;
  byClass: MarketMagnetClassRow[];
  seo: MarketMagnetSeo;
  magnetPath: string;
  marketPath: string;
};

type MagnetsFile = {
  generatedAt: string;
  siteUrl: string;
  markets: Record<string, MarketMagnet>;
};

const bundle = magnetsBundle as MagnetsFile;

export function getMarketMagnet(slug: string): MarketMagnet | null {
  return bundle.markets[slug] ?? null;
}

export function marketMagnetsGeneratedAt(): string | null {
  return bundle.generatedAt ?? null;
}
