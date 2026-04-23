#!/usr/bin/env node
// Run cross-platform duplicate detection for a market and print a summary.
//
// This is Step 1 of the canonical-vehicle rollout: READ-ONLY from the
// `listings` perspective. It only writes to the `candidate_duplicates`
// audit table (via the detect_duplicate_candidates SPI added in migration
// 007). No listing row is modified.
//
// Usage:
//   node scripts/detect_duplicates.mjs                         # defaults to san-diego-ca, 3.0 mi
//   node scripts/detect_duplicates.mjs san-diego-ca 2.5        # tighter geo threshold
//   node scripts/detect_duplicates.mjs --sample 10             # also print 10 samples per tier
//
// Output: counts by confidence tier plus optional pair samples. Review the
// samples with scripts/review_duplicates.mjs to eyeball precision.

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── .env.local loader (mirrors the pattern used by other scripts) ────────────
for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").trim();
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Argument parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flagIdx = args.findIndex((a) => a.startsWith("--"));
const positional = flagIdx === -1 ? args : args.slice(0, flagIdx);
const flags = flagIdx === -1 ? [] : args.slice(flagIdx);

const market = positional[0] ?? "san-diego-ca";
const geoMiles = Number(positional[1] ?? "3.0");
const sampleSize = (() => {
  const i = flags.indexOf("--sample");
  if (i === -1) return 0;
  return Number(flags[i + 1] ?? "10");
})();
const yearExactFlag = flags.includes("--no-year-exact") ? false : true;

if (!Number.isFinite(geoMiles) || geoMiles <= 0) {
  console.error(`Invalid geo threshold: ${positional[1]}`);
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtPair(p) {
  const ay = p.year_a ?? "?";
  const by = p.year_b ?? "?";
  const am = (p.make_a ?? "?") + " " + (p.model_a ?? "");
  const bm = (p.make_b ?? "?") + " " + (p.model_b ?? "");
  const dist = p.distance_miles === null ? "?" : Number(p.distance_miles).toFixed(2);
  const rDiff = p.rate_diff_pct === null ? "?" : Number(p.rate_diff_pct).toFixed(0);
  const mmSim = p.make_model_sim === null ? "?" : Number(p.make_model_sim).toFixed(2);
  return (
    `  [${p.confidence}] ${ay} ${am.trim()} ($${p.rate_a}) ↔ ${by} ${bm.trim()} ($${p.rate_b})\n` +
    `           dist=${dist}mi  rateΔ=${rDiff}%  mmSim=${mmSim}  sleeps=${p.sleeps_a}↔${p.sleeps_b}`
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nDetecting duplicates for market="${market}" geo≤${geoMiles}mi year_exact=${yearExactFlag}`);

  const t0 = Date.now();
  const { data: insertedCount, error } = await supabase.rpc("detect_duplicate_candidates", {
    p_market: market,
    p_geo_threshold_miles: geoMiles,
    p_year_exact: yearExactFlag,
  });

  if (error) {
    console.error("detect_duplicate_candidates failed:", error.message);
    process.exit(1);
  }
  const ms = Date.now() - t0;
  console.log(`Inserted ${insertedCount} candidate pairs (${ms} ms)\n`);

  // Count by confidence tier
  const tiers = ["high", "medium", "low"];
  const counts = {};
  for (const tier of tiers) {
    const { count } = await supabase
      .from("candidate_duplicates")
      .select("id", { count: "exact", head: true })
      .eq("market", market)
      .eq("confidence", tier);
    counts[tier] = count ?? 0;
  }

  console.log("By confidence tier:");
  for (const tier of tiers) {
    console.log(`  ${tier.padEnd(8)} ${String(counts[tier]).padStart(5)}`);
  }

  // Market-level size context — how many active listings per platform
  const platforms = ["outdoorsy", "rvshare"];
  console.log("\nActive listings in market:");
  const platformCounts = {};
  for (const platform of platforms) {
    const { count } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("market", market)
      .eq("platform", platform)
      .eq("is_active", true);
    platformCounts[platform] = count ?? 0;
    console.log(`  ${platform.padEnd(10)} ${String(count ?? 0).padStart(5)}`);
  }

  // Overlap hint: the high tier is the upper bound of "confirmed cross-
  // listed owners" (pending human review). Flag as % of the smaller platform.
  const smaller = Math.min(platformCounts.outdoorsy, platformCounts.rvshare);
  if (smaller > 0) {
    const overlapPct = ((counts.high / smaller) * 100).toFixed(1);
    console.log(`\nHigh-confidence pairs ≈ ${overlapPct}% of the smaller platform's active listings.`);
  }

  // Optional per-tier sample
  if (sampleSize > 0) {
    for (const tier of tiers) {
      if (counts[tier] === 0) continue;
      console.log(`\n── ${tier.toUpperCase()} sample (up to ${sampleSize}) ──`);
      const { data: sample, error: sErr } = await supabase
        .from("candidate_duplicates")
        .select("*")
        .eq("market", market)
        .eq("confidence", tier)
        .order("make_model_sim", { ascending: false })
        .limit(sampleSize);
      if (sErr) {
        console.error(`  FAILED: ${sErr.message}`);
        continue;
      }
      for (const p of sample) console.log(fmtPair(p));
    }
  }

  console.log(
    `\nNext step: node scripts/review_duplicates.mjs ${market} --tier high\n` +
      "That prints listing URLs side-by-side so you can eyeball the photos and validate precision.",
  );
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
