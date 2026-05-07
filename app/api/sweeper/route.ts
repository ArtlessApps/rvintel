import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

// Lifecycle sweeper — flips listings.is_active = false when a listing has not
// been seen by any cron run in the past 14 days, meaning the platform has
// removed or delisted it.
//
// Runs daily at 10:00 UTC (after all scrape crons have finished). Operates
// across ALL markets unless a specific `market` query param is provided — so
// adding a new market requires zero changes here.
//
// Auth: same CRON_SECRET pattern as /api/scrape.

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const header = req.headers.get("x-vercel-cron") ?? req.headers.get("authorization");
  return header === cronSecret || header === `Bearer ${cronSecret}`;
}

async function runSweep(marketFilter?: string) {
  const supabase = getServiceSupabase();
  const startedAt = new Date();

  // Cutoff: listings not seen in the last 14 days are considered delisted.
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Count currently active listings that are about to be swept, per market.
  // We do this before the update so we can log the before/after delta.
  let countQuery = supabase
    .from("listings")
    .select("market", { count: "exact", head: false })
    .eq("is_active", true)
    .lt("last_seen_at", cutoff);
  if (marketFilter) countQuery = countQuery.eq("market", marketFilter);

  const { data: staleRows, error: countErr } = await countQuery;
  if (countErr) {
    return NextResponse.json({ success: false, error: countErr.message }, { status: 500 });
  }

  // Tally stale count per market for the response summary.
  const staleByMarket: Record<string, number> = {};
  for (const row of staleRows ?? []) {
    const m = (row as { market: string }).market;
    staleByMarket[m] = (staleByMarket[m] ?? 0) + 1;
  }
  const staleTotal = Object.values(staleByMarket).reduce((s, n) => s + n, 0);

  // Perform the update. Supabase REST doesn't support multi-row UPDATE with
  // a RETURNING count directly, so we update then verify via the stale count.
  let updateQuery = supabase
    .from("listings")
    .update({ is_active: false })
    .eq("is_active", true)
    .lt("last_seen_at", cutoff);
  if (marketFilter) updateQuery = updateQuery.eq("market", marketFilter);

  const { error: updateErr } = await updateQuery;
  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
  }

  const finishedAt = new Date();

  // Log to cron_runs for observability parity with /api/scrape.
  await supabase.from("cron_runs").insert({
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    market: marketFilter ?? "all",
    platform: "sweeper",
    status: "success",
    listings_upserted: 0,
    snapshots_inserted: 0,
    skipped_not_rv: 0,
    error_count: 0,
    errors: null,
    error_message: null,
  });

  return NextResponse.json({
    success: true,
    market: marketFilter ?? "all",
    cutoff,
    deactivated: staleTotal,
    byMarket: staleByMarket,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const market = (body as { market?: string }).market;
  return runSweep(market);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const market = new URL(req.url).searchParams.get("market") ?? undefined;
  return runSweep(market);
}
