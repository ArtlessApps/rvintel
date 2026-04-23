#!/usr/bin/env node
// Post-backfill verification for migration 005 + 006 expansion.
//
// Prints per-platform fill rates for every new column + a sample of
// search_snapshots rows. Intended as a one-shot check after hydration;
// does not mutate anything. Safe to re-run.

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

const SHARED_COLS = ["sleeps", "length_ft", "instant_book", "delivery", "primary_image_url", "location_state", "location_lat", "location_lng"];
const OUTDOORSY_COLS = ["sleeps_adults", "sleeps_kids", "minimum_days", "cancel_policy", "delivery_radius_miles", "vehicle_height", "vehicle_dry_weight", "vehicle_gvwr", "location_city", "location_zip", "first_published", "last_published", "rental_score", "sort_score"];
const RVSHARE_COLS = ["insurance_status", "electric_service", "fresh_water_tank", "generator_usage_included", "nightly_mileage_included", "distance_from_search_miles", "owner_id", "premier_owner", "guest_favorite", "new_listing_without_reviews", "weekly_discount_percent", "monthly_discount_percent"];

async function fillRate(platform, cols) {
  const { count: total } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("market", "san-diego-ca");

  console.log(`\n── ${platform} (n=${total}) ──`);
  for (const col of cols) {
    const { count: filled } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("platform", platform)
      .eq("market", "san-diego-ca")
      .not(col, "is", null);
    const pct = total ? ((filled / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${col.padEnd(32)} ${String(filled).padStart(5)}/${total}  (${pct}%)`);
  }
}

async function searchSnapshotsSummary() {
  console.log("\n── search_snapshots ──");
  const { data, error } = await supabase
    .from("search_snapshots")
    .select("platform, market, rv_class, captured_at, total_results, price_median, price_histogram, length_histogram")
    .order("captured_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error(`  FAILED: ${error.message}`);
    return;
  }
  for (const r of data) {
    const histCount = (r.price_histogram ? (Array.isArray(r.price_histogram) ? r.price_histogram.length : Object.keys(r.price_histogram).length) : 0);
    const lenHist = r.length_histogram ? (Array.isArray(r.length_histogram) ? r.length_histogram.length : 0) : 0;
    console.log(
      `  ${r.captured_at}  ${r.platform.padEnd(9)} ${(r.rv_class ?? "—").padEnd(16)} total=${String(r.total_results).padStart(4)}  priceHist=${histCount}  lenHist=${lenHist}  median=${r.price_median ?? "—"}`,
    );
  }
}

async function main() {
  console.log("Shared columns:");
  await fillRate("outdoorsy", SHARED_COLS);
  await fillRate("rvshare", SHARED_COLS);

  console.log("\nOutdoorsy-only columns:");
  await fillRate("outdoorsy", OUTDOORSY_COLS);

  console.log("\nRVshare-only columns:");
  await fillRate("rvshare", RVSHARE_COLS);

  await searchSnapshotsSummary();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
