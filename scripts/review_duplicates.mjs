#!/usr/bin/env node
// Print candidate duplicate pairs in a format designed for human eyeballing.
//
// Step 2 of the canonical-vehicle rollout. Run after detect_duplicates.mjs
// populates the candidate_duplicates audit table. For each pair it prints:
//   - The listing URLs on each platform
//   - The primary image URLs (click to open, compare at a glance)
//   - Every signal the confidence scorer used
//
// Usage:
//   node scripts/review_duplicates.mjs                         # defaults: san-diego-ca, high tier, 20 pairs
//   node scripts/review_duplicates.mjs san-diego-ca --tier medium
//   node scripts/review_duplicates.mjs san-diego-ca --tier high --limit 30
//   node scripts/review_duplicates.mjs --unreviewed             # only pairs you haven't verdicted yet
//   node scripts/review_duplicates.mjs --model coleman          # only pairs where make or model matches
//   node scripts/review_duplicates.mjs --canonical <uuid>       # only pairs inside one canonical_vehicle's component
//   node scripts/review_duplicates.mjs --verdict match --id 42  # record a verdict
//
// Recording verdicts lets you track precision over time. The first pass
// should be eyeball-only; once you've seen ~20 pairs, start recording
// verdicts so the false-positive rate is measurable.

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

// ── Argument parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const firstPositional = args.find((a) => !a.startsWith("--"));
const market = firstPositional ?? "san-diego-ca";
const tier = getFlag("tier", "high");
const limit = Number(getFlag("limit", "20"));
const onlyUnreviewed = hasFlag("unreviewed");
const modelFilter = getFlag("model");
const canonicalId = getFlag("canonical");

const verdict = getFlag("verdict");  // 'match' | 'not_match' | 'unclear'
const verdictId = getFlag("id");
const verdictNotes = getFlag("notes");

// ── Verdict recording mode ───────────────────────────────────────────────────
if (verdict) {
  if (!["match", "not_match", "unclear"].includes(verdict)) {
    console.error(`Invalid --verdict: ${verdict}. Use match | not_match | unclear.`);
    process.exit(1);
  }
  if (!verdictId) {
    console.error("--verdict requires --id <candidate_duplicates.id>");
    process.exit(1);
  }
  const { error } = await supabase
    .from("candidate_duplicates")
    .update({
      reviewed: true,
      reviewer_verdict: verdict,
      reviewer_notes: verdictNotes && typeof verdictNotes === "string" ? verdictNotes : null,
    })
    .eq("id", verdictId);
  if (error) {
    console.error(`Failed to record verdict: ${error.message}`);
    process.exit(1);
  }
  console.log(`Recorded verdict="${verdict}" for candidate #${verdictId}`);
  process.exit(0);
}

// ── Listing fetch helper (for primary_image_url + listing_url) ───────────────
async function fetchListings(ids) {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("listings")
    .select("id, platform, listing_url, primary_image_url, location_city, location_state, host_name")
    .in("id", ids);
  if (error) throw new Error(`listings fetch failed: ${error.message}`);
  return Object.fromEntries(data.map((r) => [r.id, r]));
}

// ── Pretty-print a pair ──────────────────────────────────────────────────────
function fmtPair(p, listings) {
  const a = listings[p.listing_a_id] ?? {};
  const b = listings[p.listing_b_id] ?? {};

  const dist = p.distance_miles === null ? "?" : Number(p.distance_miles).toFixed(2);
  const rDiff = p.rate_diff_pct === null ? "?" : Number(p.rate_diff_pct).toFixed(0);
  const mmSim = p.make_model_sim === null ? "?" : Number(p.make_model_sim).toFixed(2);
  const mSim = p.make_sim === null ? "?" : Number(p.make_sim).toFixed(2);
  const modSim = p.model_sim === null ? "?" : Number(p.model_sim).toFixed(2);
  const lenDiff = p.length_diff_ft === null ? "?" : Number(p.length_diff_ft).toFixed(1);

  const reviewedTag = p.reviewed
    ? ` [reviewed: ${p.reviewer_verdict}]`
    : "";

  const lines = [
    `━━━━ Candidate #${p.id} [${p.confidence.toUpperCase()}]${reviewedTag} ━━━━`,
    `  A (${p.platform_a})  ${p.year_a ?? "?"} ${p.make_a ?? "?"} ${p.model_a ?? ""}`.trimEnd(),
    `             ${a.listing_url ?? "(no url)"}`,
    `             img: ${a.primary_image_url ?? "(no image)"}`,
    `             loc: ${a.location_city ?? "?"}, ${a.location_state ?? "?"}  host: ${a.host_name ?? "?"}`,
    `  B (${p.platform_b})  ${p.year_b ?? "?"} ${p.make_b ?? "?"} ${p.model_b ?? ""}`.trimEnd(),
    `             ${b.listing_url ?? "(no url)"}`,
    `             img: ${b.primary_image_url ?? "(no image)"}`,
    `             loc: ${b.location_city ?? "?"}, ${b.location_state ?? "?"}  host: ${b.host_name ?? "?"}`,
    `  signals: dist=${dist}mi  rate=$${p.rate_a}↔$${p.rate_b} (Δ${rDiff}%)`,
    `           sleeps=${p.sleeps_a}↔${p.sleeps_b}  length=${p.length_a ?? "?"}↔${p.length_b ?? "?"}ft (Δ${lenDiff})`,
    `           mkSim=${mSim}  modSim=${modSim}  mmSim=${mmSim}  yearMatch=${p.year_match}  sleepsMatch=${p.sleeps_match}`,
    `  verdict: node scripts/review_duplicates.mjs --verdict match --id ${p.id}`,
    `           node scripts/review_duplicates.mjs --verdict not_match --id ${p.id}`,
  ];
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `Reviewing candidate duplicates: market="${market}" tier="${tier}" limit=${limit}` +
      (onlyUnreviewed ? " unreviewed=true" : ""),
  );

  let query = supabase
    .from("candidate_duplicates")
    .select("*")
    .eq("market", market);

  if (tier !== "all") query = query.eq("confidence", tier);
  if (onlyUnreviewed) query = query.eq("reviewed", false);

  // Restrict to the candidate pairs that are endpoints inside a canonical
  // vehicle's component. Useful for spot-checking a specific canonical.
  if (canonicalId && typeof canonicalId === "string") {
    const { data: canonical, error: canErr } = await supabase
      .from("canonical_vehicles")
      .select("listing_ids, rv_year, rv_make, rv_model, listing_count")
      .eq("id", canonicalId)
      .single();
    if (canErr || !canonical) {
      console.error(`Canonical ${canonicalId} not found: ${canErr?.message ?? "no row"}`);
      process.exit(1);
    }
    console.log(
      `Scoped to canonical ${canonicalId} (${canonical.rv_year ?? "?"} ${canonical.rv_make ?? "?"} ${canonical.rv_model ?? ""}, ${canonical.listing_count} listings)`,
    );
    query = query
      .in("listing_a_id", canonical.listing_ids)
      .in("listing_b_id", canonical.listing_ids);
  }

  // Substring filter on make or model (case-insensitive). Cheap way to scope
  // review to a concerning model family, e.g. --model coleman.
  if (modelFilter && typeof modelFilter === "string") {
    const pattern = `%${modelFilter}%`;
    query = query.or(
      [
        `make_a.ilike.${pattern}`,
        `make_b.ilike.${pattern}`,
        `model_a.ilike.${pattern}`,
        `model_b.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data: pairs, error } = await query
    .order("make_model_sim", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  if (!pairs || pairs.length === 0) {
    console.log("No candidates match those filters.");
    process.exit(0);
  }

  // Batch-fetch listings for all referenced ids so we don't N+1
  const ids = Array.from(new Set(pairs.flatMap((p) => [p.listing_a_id, p.listing_b_id])));
  const listings = await fetchListings(ids);

  console.log(`\nShowing ${pairs.length} pair(s), sorted by make_model_sim desc:\n`);
  for (const p of pairs) {
    console.log(fmtPair(p, listings));
    console.log();
  }

  // Precision readout for any already-reviewed pairs in this view.
  const reviewedPairs = pairs.filter((p) => p.reviewed);
  if (reviewedPairs.length > 0) {
    const matches = reviewedPairs.filter((p) => p.reviewer_verdict === "match").length;
    const notMatches = reviewedPairs.filter((p) => p.reviewer_verdict === "not_match").length;
    const unclear = reviewedPairs.filter((p) => p.reviewer_verdict === "unclear").length;
    const precision = matches + notMatches > 0
      ? ((matches / (matches + notMatches)) * 100).toFixed(1)
      : "—";
    console.log(
      `Precision on reviewed pairs in this view: ${precision}% (matches=${matches}, not_match=${notMatches}, unclear=${unclear})`,
    );
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
