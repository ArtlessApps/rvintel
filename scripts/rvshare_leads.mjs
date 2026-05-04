#!/usr/bin/env node
// RVshare fleet-host lead generator — pure SQL against public.listings.
//
// RVshare's `owner_id` is captured on every daily cron via backfill_rvshare_sd.mjs
// (migration 005, 2026-04-23). That means the lead list for any market we
// already scrape is just a GROUP BY query — zero scraping, zero credits, zero
// rate-limit risk. This script materializes the query into a CSV that mirrors
// the schema of scripts/outdoorsy_leads.py so downstream outreach tooling can
// concat the two.
//
// What this script CANNOT get from Supabase (because RVshare's search JSON:API
// doesn't expose it):
//   - Host name / business name. Only owner_id is in our snapshot.
//   - Website / phone / email.
//
// To enrich those we'd need to fetch the public RVshare host profile
// (rvshare.com/users/<owner_id>), which is a future enhancement. For now this
// script outputs the raw fleet signal — owner_id, listing_count, premier
// flag, classes, sample listing URL — which is enough to start outreach via
// the in-platform message system on each sample listing.
//
// Usage:
//   node scripts/rvshare_leads.mjs                         # defaults: san-diego-ca, ≥2 listings
//   node scripts/rvshare_leads.mjs --market phoenix-az --min-listings 3
//   node scripts/rvshare_leads.mjs --output rvshare_sd_leads.csv

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env loader (same defensive parser used by the backfill scripts) ──────────
for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ── arg parsing ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const market = getFlag("market", "san-diego-ca");
const minListings = Number(getFlag("min-listings", "2"));
const output = getFlag("output", `rvshare_${market}_leads.csv`);

// ── query ────────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("=".repeat(64));
console.log("RVshare fleet-host lead generator");
console.log(`  market        : ${market}`);
console.log(`  min listings  : ${minListings}`);
console.log(`  output        : ${output}`);
console.log("=".repeat(64));

// Pull all active listings in the market, then aggregate client-side. This is
// simpler than a Postgres function and the row count is tiny per market
// (~1,300 for SD).
const { data: rows, error } = await supabase
  .from("listings")
  .select(
    "owner_id, premier_owner, rv_class, listing_url, nightly_rate, review_count, avg_rating, location_state, primary_image_url, last_seen_at",
  )
  .eq("platform", "rvshare")
  .eq("market", market)
  .eq("is_active", true)
  .not("owner_id", "is", null);

if (error) {
  console.error("Supabase query failed:", error.message);
  process.exit(1);
}
if (!rows || rows.length === 0) {
  console.error(`No active RVshare listings found for market="${market}".`);
  console.error(`Has scripts/backfill_rvshare_sd.mjs been run for this market yet?`);
  process.exit(1);
}

console.log(`\nFetched ${rows.length} active rentals from Supabase.`);

// Group by owner_id
const fleets = new Map();
for (const r of rows) {
  const id = String(r.owner_id);
  if (!fleets.has(id)) {
    fleets.set(id, {
      owner_id: id,
      premier_owner: false,
      listings: [],
      rv_classes: new Set(),
      states: new Set(),
    });
  }
  const f = fleets.get(id);
  if (r.premier_owner) f.premier_owner = true;
  f.listings.push(r);
  if (r.rv_class) f.rv_classes.add(r.rv_class);
  if (r.location_state) f.states.add(r.location_state);
}

const candidates = [...fleets.values()].filter((f) => f.listings.length >= minListings);

// Sort: premier first, then by listing count, then total reviews
candidates.sort((a, b) => {
  if (a.premier_owner !== b.premier_owner) return a.premier_owner ? -1 : 1;
  if (a.listings.length !== b.listings.length) return b.listings.length - a.listings.length;
  const aRev = a.listings.reduce((s, l) => s + (l.review_count || 0), 0);
  const bRev = b.listings.reduce((s, l) => s + (l.review_count || 0), 0);
  return bRev - aRev;
});

console.log(`Unique owners: ${fleets.size}`);
console.log(`Fleet candidates (≥${minListings} listings): ${candidates.length}`);

// ── CSV emission ─────────────────────────────────────────────────────────────
// Column set is intentionally a subset of the Outdoorsy CSV plus a `Platform`
// column, so the two files can be concatenated for outreach.
const COLUMNS = [
  "Platform",
  "Owner ID",
  "Host Name",
  "Business Name",
  "Premier Owner",
  "Listing Count",
  "RV Classes",
  "States",
  "Total Reviews",
  "Best Rating",
  "Avg Nightly",
  "Profile URL",
  "Sample Listing URL",
  "Sample Image URL",
  "Last Seen At",
  "Market",
  "Scraped At",
];

const scrapedAt = new Date().toISOString();

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const lines = [COLUMNS.join(",")];
for (const f of candidates) {
  const totalReviews = f.listings.reduce((s, l) => s + (l.review_count || 0), 0);
  const bestRating = f.listings.reduce((m, l) => Math.max(m, l.avg_rating || 0), 0);
  const avgNightly =
    f.listings.reduce((s, l) => s + (l.nightly_rate || 0), 0) / f.listings.length;
  // Pick the most-reviewed listing as the sample — best chance of recognition
  // when we cite it in outreach.
  const sample = [...f.listings].sort(
    (a, b) => (b.review_count || 0) - (a.review_count || 0),
  )[0];
  const lastSeen = f.listings
    .map((l) => l.last_seen_at)
    .filter(Boolean)
    .sort()
    .pop();

  const row = {
    Platform: "rvshare",
    "Owner ID": f.owner_id,
    "Host Name": "",
    "Business Name": "",
    "Premier Owner": f.premier_owner ? "true" : "false",
    "Listing Count": f.listings.length,
    "RV Classes": [...f.rv_classes].sort().join(" | "),
    States: [...f.states].sort().join(" | "),
    "Total Reviews": totalReviews,
    "Best Rating": bestRating ? bestRating.toFixed(2) : "",
    "Avg Nightly": avgNightly ? `$${avgNightly.toFixed(0)}` : "",
    "Profile URL": `https://rvshare.com/users/${f.owner_id}`,
    "Sample Listing URL": sample?.listing_url || "",
    "Sample Image URL": sample?.primary_image_url || "",
    "Last Seen At": lastSeen || "",
    Market: market,
    "Scraped At": scrapedAt,
  };
  lines.push(COLUMNS.map((c) => csvEscape(row[c])).join(","));
}

fs.writeFileSync(output, lines.join("\n") + "\n", "utf-8");

const premierCount = candidates.filter((f) => f.premier_owner).length;
console.log("");
console.log("=".repeat(64));
console.log("SUMMARY");
console.log("=".repeat(64));
console.log(`  Active RVshare rentals  : ${rows.length}`);
console.log(`  Unique owners           : ${fleets.size}`);
console.log(`  Fleet candidates        : ${candidates.length}`);
console.log(`  Premier owners          : ${premierCount}`);
console.log(`  Output                  : ${output}`);
console.log("=".repeat(64));
