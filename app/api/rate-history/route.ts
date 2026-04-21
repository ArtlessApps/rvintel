import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

const WINDOW_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market");
  const rvClass = searchParams.get("rv_class");
  const windowKey = searchParams.get("window") ?? "30d";

  if (!market || !rvClass) {
    return NextResponse.json(
      { error: "market and rv_class are required" },
      { status: 400 }
    );
  }

  const days = WINDOW_DAYS[windowKey] ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getServiceSupabase();

  // 1. Find listing IDs matching the market + class filter (include inactive so
  //    history is preserved even after a listing is delisted).
  const { data: listingRows, error: listingsErr } = await supabase
    .from("listings")
    .select("id")
    .eq("market", market)
    .eq("rv_class", rvClass);

  if (listingsErr) {
    return NextResponse.json({ error: listingsErr.message }, { status: 500 });
  }

  const listingIds = (listingRows ?? []).map((r) => r.id);
  if (listingIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // 2. Pull snapshots in the window. Page through in chunks to stay under the
  //    default 1000-row cap when a market has lots of listings.
  const PAGE = 1000;
  type SnapshotRow = { captured_at: string; nightly_rate: number };
  const rows: SnapshotRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("listing_snapshots")
      .select("captured_at, nightly_rate")
      .in("listing_id", listingIds)
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as SnapshotRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 3. Aggregate by UTC day.
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const day = r.captured_at.slice(0, 10); // YYYY-MM-DD
    const bucket = buckets.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += Number(r.nightly_rate);
    bucket.count += 1;
    buckets.set(day, bucket);
  }

  const series = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date,
      avg: Math.round(sum / count),
      count,
    }));

  return NextResponse.json({ data: series });
}
