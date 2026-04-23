import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

// Cross-platform duplicate detection endpoint.
//
// Wraps the `detect_duplicate_candidates` SPI from migration 007. Runs
// read-only against `listings` and writes candidate pairs to the
// `candidate_duplicates` audit table. Safe to call repeatedly — the SPI
// truncates prior rows for the target market before inserting.
//
// This endpoint is intentionally separated from /api/scrape so a broken
// detection run can never block the cron that actually keeps listings fresh.
// It is also deliberately not wired to a Vercel cron yet — we want to run
// it manually while we are still tuning the confidence thresholds, and
// schedule it only after step 2 (manual review) confirms precision.
//
// Auth: same CRON_SECRET pattern as /api/scrape. In dev (no secret set) it
// is open; in prod it requires either the `x-vercel-cron` header or an
// `Authorization: Bearer …` header matching CRON_SECRET.

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

type DetectRequest = {
  market?: string;
  geoThresholdMiles?: number;
  yearExact?: boolean;
};

async function runDetection(body: DetectRequest) {
  const market = body.market ?? "san-diego-ca";
  const geoThresholdMiles = body.geoThresholdMiles ?? 3.0;
  const yearExact = body.yearExact ?? true;

  if (!Number.isFinite(geoThresholdMiles) || geoThresholdMiles <= 0) {
    return NextResponse.json(
      { success: false, error: `invalid geoThresholdMiles: ${geoThresholdMiles}` },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const startedAt = new Date();

  // Call the detection SPI. Return value is the count of pairs inserted.
  const { data: insertedCount, error: rpcErr } = await supabase.rpc(
    "detect_duplicate_candidates",
    {
      p_market: market,
      p_geo_threshold_miles: geoThresholdMiles,
      p_year_exact: yearExact,
    },
  );

  if (rpcErr) {
    return NextResponse.json(
      {
        success: false,
        error: `detect_duplicate_candidates failed: ${rpcErr.message}`,
      },
      { status: 500 },
    );
  }

  // Breakdown by confidence tier so the caller knows at a glance how many
  // pairs need review vs. how many are auto-link candidates.
  const tiers = ["high", "medium", "low"] as const;
  const byTier: Record<(typeof tiers)[number], number> = { high: 0, medium: 0, low: 0 };
  for (const tier of tiers) {
    const { count } = await supabase
      .from("candidate_duplicates")
      .select("id", { count: "exact", head: true })
      .eq("market", market)
      .eq("confidence", tier);
    byTier[tier] = count ?? 0;
  }

  const finishedAt = new Date();

  return NextResponse.json({
    success: true,
    market,
    geoThresholdMiles,
    yearExact,
    inserted: insertedCount,
    byConfidence: byTier,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as DetectRequest;
  return runDetection(body);
}

// GET exists so a one-off curl or Vercel Cron invocation works without a
// body. Query params mirror the POST body shape.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const market = url.searchParams.get("market") ?? undefined;
  const geoParam = url.searchParams.get("geoThresholdMiles");
  const yearExactParam = url.searchParams.get("yearExact");

  return runDetection({
    market,
    geoThresholdMiles: geoParam !== null ? Number(geoParam) : undefined,
    yearExact: yearExactParam !== null ? yearExactParam !== "false" : undefined,
  });
}
