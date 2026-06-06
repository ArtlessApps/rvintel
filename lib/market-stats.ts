import { createClient } from "@supabase/supabase-js";

export type MarketStats = {
  listingCount: number;
  avgRate: number | null;
  medianRate: number | null;
  outdoorsyCount: number;
  rvshareCount: number;
};

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function fetchMarketStats(marketSlug: string): Promise<MarketStats> {
  const supabase = getServiceSupabase();
  const PAGE = 1000;
  const rates: number[] = [];
  let outdoorsyCount = 0;
  let rvshareCount = 0;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .rpc("listings_in_market", {
        p_market_slug: marketSlug,
        p_rv_class: null,
        p_active_only: true,
      })
      .select("nightly_rate, platform")
      .not("nightly_rate", "is", null)
      .gt("nightly_rate", 0)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      if (row.platform === "outdoorsy") outdoorsyCount++;
      else if (row.platform === "rvshare") rvshareCount++;
      if (typeof row.nightly_rate === "number") rates.push(row.nightly_rate);
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  const sorted = [...rates].sort((a, b) => a - b);
  const avgRate = rates.length
    ? Math.round(rates.reduce((a, v) => a + v, 0) / rates.length)
    : null;

  return {
    listingCount: outdoorsyCount + rvshareCount,
    avgRate,
    medianRate: median(sorted) !== null ? Math.round(median(sorted)!) : null,
    outdoorsyCount,
    rvshareCount,
  };
}
