#!/usr/bin/env node
// Promote candidate_duplicates into canonical_vehicles for a market.
//
// This is Step 2 of the canonical-vehicle rollout: it writes. For each market
// it re-runs the connected-components pass in migration 010's promotion SPI,
// replacing all prior canonical_vehicles rows for that market. Safe to re-run
// after new reviewer verdicts or after a fresh detect_duplicate_candidates pass.
//
// Usage:
//   node scripts/promote_canonical.mjs                         # defaults to san-diego-ca
//   node scripts/promote_canonical.mjs san-diego-ca
//   node scripts/promote_canonical.mjs san-diego-ca --sample 10
//
// Output:
//   - canonical rows created + listings linked
//   - breakdown by source (auto_high / reviewer_match / mixed)
//   - breakdown by platform mix (outdoorsy+rvshare vs. single-platform N:M)
//   - optional sample of the widest canonicals (most listings merged)

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const args = process.argv.slice(2);
const flagIdx = args.findIndex((a) => a.startsWith("--"));
const positional = flagIdx === -1 ? args : args.slice(0, flagIdx);
const flags = flagIdx === -1 ? [] : args.slice(flagIdx);

const market = positional[0] ?? "san-diego-ca";

const sampleIdx = flags.indexOf("--sample");
const sampleSize = sampleIdx === -1 ? 0 : Number(flags[sampleIdx + 1] ?? "10");

console.log(`\nPromoting canonicals for market=${market}\n`);

const t0 = Date.now();
const { data: result, error } = await supabase.rpc("promote_candidates_to_canonical", {
  p_market: market,
});

if (error) {
  console.error("SPI failed:", error);
  process.exit(1);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const row = Array.isArray(result) ? result[0] : result;
const canonicalCount = row?.canonical_count ?? 0;
const listingsLinked = row?.listings_linked ?? 0;

console.log(`Done in ${elapsed}s.\n`);
console.log(`  canonical_vehicles created : ${canonicalCount}`);
console.log(`  listings linked             : ${listingsLinked}`);
if (canonicalCount > 0) {
  const avgSize = (listingsLinked / canonicalCount).toFixed(2);
  console.log(`  avg listings per canonical  : ${avgSize}`);
}

// ── Breakdown by source ──────────────────────────────────────────────────────
const { data: sourceRows, error: sourceErr } = await supabase
  .from("canonical_vehicles")
  .select("source")
  .eq("market", market);

if (!sourceErr && sourceRows) {
  const bySource = sourceRows.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n  by source:`);
  for (const [src, n] of Object.entries(bySource)) {
    console.log(`    ${src.padEnd(16)} ${n}`);
  }
}

// ── Breakdown by platform cardinality ────────────────────────────────────────
const { data: platformRows, error: platformErr } = await supabase
  .from("canonical_vehicles")
  .select("platforms, listing_count")
  .eq("market", market);

if (!platformErr && platformRows) {
  const byShape = platformRows.reduce((acc, r) => {
    const shape = `${r.platforms.join("+")} (${r.listing_count} listings)`;
    acc[shape] = (acc[shape] ?? 0) + 1;
    return acc;
  }, {});
  const topShapes = Object.entries(byShape).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`\n  by platform × size:`);
  for (const [shape, n] of topShapes) {
    console.log(`    ${shape.padEnd(48)} ${n}`);
  }
}

// ── Optional sample — the widest canonicals ──────────────────────────────────
if (sampleSize > 0) {
  const { data: samples, error: sampleErr } = await supabase
    .from("canonical_vehicles")
    .select("id, rv_year, rv_make, rv_model, rv_class, platforms, listing_count, listing_ids, source")
    .eq("market", market)
    .order("listing_count", { ascending: false })
    .limit(sampleSize);

  if (!sampleErr && samples && samples.length > 0) {
    console.log(`\n  sample — widest ${samples.length} canonicals:\n`);
    for (const c of samples) {
      const year = c.rv_year ?? "?";
      const label = `${year} ${c.rv_make ?? "?"} ${c.rv_model ?? ""}`.trim();
      console.log(`    ${label.padEnd(36)} ${c.platforms.join("+").padEnd(20)} ${c.listing_count}× (${c.source})`);
    }
  }
}

// ── Sanity check: total listings vs. canonical-dedup denominator ─────────────
// Use count-only queries (head: true) so the 1000-row default select cap doesn't
// silently truncate the denominator on markets with >1000 active listings.
async function countActive(extra) {
  let q = supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("market", market)
    .eq("is_active", true);
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

try {
  const [totalActive, linkedActive, outdoorsyActive, rvshareActive] = await Promise.all([
    countActive(),
    countActive((q) => q.not("canonical_vehicle_id", "is", null)),
    countActive((q) => q.eq("platform", "outdoorsy")),
    countActive((q) => q.eq("platform", "rvshare")),
  ]);

  const singletons = totalActive - linkedActive;
  const dedupDenominator = singletons + canonicalCount;
  const rowsCollapsed = totalActive - dedupDenominator; // listings_linked - canonicals
  const shrinkVsTotal = totalActive === 0 ? 0 : (rowsCollapsed / totalActive) * 100;
  const smallerPlatform = Math.min(outdoorsyActive, rvshareActive);
  const smallerName = outdoorsyActive <= rvshareActive ? "outdoorsy" : "rvshare";
  const shrinkVsSmaller = smallerPlatform === 0 ? 0 : (rowsCollapsed / smallerPlatform) * 100;

  console.log(`\n  market coverage:`);
  console.log(`    active listings               : ${totalActive}  (outdoorsy ${outdoorsyActive} + rvshare ${rvshareActive})`);
  console.log(`    linked to canonical           : ${linkedActive}`);
  console.log(`    singletons                    : ${singletons}`);
  console.log(`    dedup denominator             : ${dedupDenominator}`);
  console.log(`    rows collapsed                : ${rowsCollapsed}`);
  console.log(`    shrink vs. total active       : ${shrinkVsTotal.toFixed(2)}%`);
  console.log(`    shrink vs. smaller (${smallerName.padEnd(9)}): ${shrinkVsSmaller.toFixed(2)}%`);

  if (linkedActive !== listingsLinked) {
    console.log(`\n  ⚠  SPI reported ${listingsLinked} listings linked but ${linkedActive} are linked AND active.`);
    console.log(`     ${listingsLinked - linkedActive} canonical member(s) are inactive (last_seen_at < now() - 14d).`);
  }
} catch (err) {
  console.error("Coverage query failed:", err);
}

console.log();
