#!/usr/bin/env node
// RVshare San Diego backfill — direct JSON:API variant (2026-04-22 rewrite).
//
// Replaces the pre-pivot Firecrawl+LLM ingestion path. The RVshare search page
// backend at rvshare.com/rv-rental.json returns the full paginated San Diego
// universe at zero external cost, no Cloudflare bot defense, no auth.
//
// Strategy:
//   Paginate rvshare.com/rv-rental.json?location=san+diego+ca&page=1..N until
//   pagination.totalPages is exhausted. Upsert every listing into
//   public.listings; append a snapshot per listing into public.listing_snapshots.
//   Log one row to cron_runs at the end.
//
// Critical finding (see PRD §11 2026-04-22 RVshare entry):
//   The `type=` URL parameter on rvshare.com is COSMETIC — the backend ignores
//   it. Our pre-pivot config hit 8 per-type URLs per day and the LLM was
//   silently client-side re-classifying the same shared universe 8 times over.
//   This backfill makes ONE location-scoped sweep and classifies each listing
//   from `attributes.type` string. Expected San Diego universe: ~1,283
//   listings (snapshot captured 2026-04-22 — varies with nearby-market tides).
//
// Output guarantees:
//   - unique listing count == pagination.totalResults (verified on discovery).
//   - No duplicate listing_urls (backend returns unique IDs).
//   - No Firecrawl calls, no LLM extraction, no bot-defense hazard.
//
// Usage:
//   node scripts/backfill_rvshare_sd.mjs
//
// This script mirrors lib/rvshare-api.ts in pure JS so it runs outside
// Vercel's 300s function cap.

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env loader (same defensive parser — .env.local has literal \n in some values) ──
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

// ── config ────────────────────────────────────────────────────────────────────
const MARKET = "san-diego-ca";
const PLATFORM = "rvshare";
const LOCATION = "san diego ca"; // matches UI URL param
const PAGE_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 15_000;
const UPSERT_CHUNK = 50;
// RVshare reports ~65 pages for the SD universe; 80 is a comfortable safety cap.
const MAX_PAGES = 80;

// display-type → rv_class (mirror of RVSHARE_TYPE_TO_RV_CLASS_TABLE in
// lib/rvshare-api.ts — keep in sync).
const TYPE_MAP = {
  "class a motor home": "Class A",
  "class b camping van": "Class B",
  "class b motor home": "Class B",
  "class c motor home": "Class C",
  "travel trailer": "Travel Trailer",
  "fifth wheel": "Fifth Wheel",
  "fifth wheel trailer": "Fifth Wheel",
  "toy hauler": "Toy Hauler",
  "pop up camper": "Pop Up",
  "pop-up camper": "Pop Up",
  "pop up trailer": "Pop Up",
  "truck camper": "Truck Camper",
};

function typeToClass(raw) {
  if (!raw || typeof raw !== "string") return "Other";
  return TYPE_MAP[raw.toLowerCase().trim()] ?? "Other";
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── fetch helpers ─────────────────────────────────────────────────────────────

function backendUrl(page) {
  const u = new URL("https://rvshare.com/rv-rental.json");
  u.searchParams.set("location", LOCATION);
  if (page > 1) u.searchParams.set("page", String(page));
  return u.toString();
}

function uiUrl() {
  const u = new URL("https://rvshare.com/rv-rental");
  u.searchParams.set("location", LOCATION);
  return u.toString();
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Referer: "https://rvshare.com/",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`http ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── normalizer (mirror of lib/rvshare-api.ts#normalizeRental) ─────────────────
// Schema expansion (2026-04-23): capture every high-value field the search
// JSON returns. Keep in sync with lib/rvshare-api.ts#normalizeRental and the
// mapping in app/api/scrape/route.ts#scrapeRvshareViaApi.
const asNum = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
};
const asStr = (v) => (typeof v === "string" && v.trim() !== "" ? v : null);
const asBool = (v) => (typeof v === "boolean" ? v : null);

function normalizeHistogram(raw) {
  if (!raw || typeof raw !== "object") return null;
  const buckets = raw.buckets;
  if (!Array.isArray(buckets)) return null;
  const result = [];
  for (const b of buckets) {
    if (!b || typeof b !== "object") continue;
    const key = asNum(b.key);
    const doc_count = asNum(b.doc_count);
    if (key !== null && doc_count !== null) result.push({ key, doc_count });
  }
  return result.length > 0 ? result : null;
}

function normalizeRental(raw) {
  const a = raw.attributes ?? {};
  const reviews = a.reviews ?? {};
  const loc = a.location ?? {};
  const owner = a.owner ?? {};
  const thumbnail = a.thumbnail ?? {};

  // reviews.score is 0-100 on RVshare; convert to 0-5 stars.
  const rawScore = asNum(reviews.score);
  const maxScore = asNum(reviews.max_score) ?? 100;
  const avg_rating =
    rawScore !== null && maxScore > 0
      ? Math.round((rawScore / maxScore) * 5 * 100) / 100
      : null;

  return {
    id: raw.id,
    listing_url: `https://rvshare.com/rvs/details/${raw.id}`,
    display_type: asStr(a.type),
    rv_class: typeToClass(a.type),
    make: asStr(a.make),
    model: asStr(a.model),
    year: asNum(a.rv_year),
    nightly_rate: asNum(a.rate),
    avg_rating,
    review_count: asNum(reviews.count),
    // Capacity / booking policy
    sleeps: asNum(a.how_many_it_sleeps),
    length_ft: asNum(a.length),
    is_instant_book: asBool(a.is_instant_book),
    delivery: asBool(a.delivery),
    insurance_status: asStr(a.insurance_status),
    // Technical specs
    electric_service: asNum(a.electric_service),
    fresh_water_tank: asNum(a.fresh_water_tank),
    generator_usage_included: asNum(a.generator_usage_included),
    nightly_mileage_included: asNum(a.nightly_mileage_included),
    // Location
    location_name: asStr(loc.name),
    location_state: asStr(loc.state),
    location_lat: asNum(loc.lat),
    location_lng: asNum(loc.lng),
    distance_from_search_miles: asNum(loc.distance),
    // Owner
    owner_id: asNum(owner.id),
    premier_owner: asBool(owner.premier_owner),
    // Badges
    guest_favorite: asBool(a.guest_favorite),
    new_listing_without_reviews: asBool(a.new_listing_without_reviews),
    // Discounts
    weekly_discount_percent: asNum(a.weekly_discount_percent),
    monthly_discount_percent: asNum(a.monthly_discount_percent),
    // Media
    primary_image_url: asStr(thumbnail.url) ?? asStr(thumbnail.filename),
  };
}

// ── sweep ─────────────────────────────────────────────────────────────────────
async function sweepMarket() {
  const log = (msg) => console.log(`[rvshare] ${msg}`);
  const sourceUrl = uiUrl();

  const listings = [];
  const seenIds = new Set();
  let totalResults = null;
  let totalPages = null;
  let pagesFetched = 0;
  const errors = [];
  // Histograms are market-wide and returned on every page — capture them from
  // page 1 (they're stable across the sweep by Elasticsearch aggregation
  // semantics: the same query → the same buckets). We don't overwrite with
  // later pages to avoid a race with a mid-sweep fleet change.
  let capturedMeta = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let json;
    try {
      json = await fetchPage(backendUrl(page));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`page=${page}: ${msg}`);
      log(`  page=${page} FAILED — ${msg}`);
      break;
    }
    pagesFetched++;
    const data = json?.data ?? {};
    const pag = data.pagination ?? {};
    if (totalResults === null && typeof pag.totalResults === "number") totalResults = pag.totalResults;
    if (totalPages === null && typeof pag.totalPages === "number") totalPages = pag.totalPages;
    if (capturedMeta === null) {
      capturedMeta = {
        total_results: asNum(pag.totalResults),
        total_pages: asNum(pag.totalPages),
        nightly_rate_histogram: normalizeHistogram(data.nightlyRateHistogram),
        length_histogram: normalizeHistogram(data.lengthHistogram),
        generator_histogram: normalizeHistogram(data.generatorHistogram),
        fresh_water_tank_histogram: normalizeHistogram(data.freshWaterTankHistogram),
        nightly_mileage_histogram: normalizeHistogram(data.nightlyMileageHistogram),
      };
    }

    const results = Array.isArray(data.results) ? data.results : [];
    let newThisPage = 0;
    for (const raw of results) {
      if (seenIds.has(raw.id)) continue;
      seenIds.add(raw.id);
      listings.push(normalizeRental(raw));
      newThisPage++;
    }
    log(
      `  page=${page}: got ${results.length}, new ${newThisPage}, cum ${listings.length}${totalResults !== null ? `/${totalResults}` : ""}`,
    );

    if (totalPages !== null && page >= totalPages) break;
    if (results.length === 0) break;
    if (totalResults !== null && listings.length >= totalResults) break;
    if (PAGE_DELAY_MS > 0) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  // Market-wide meta snapshot — one row per run, rv_class=NULL (RVshare queries
  // are type-agnostic). Write even when listings.length === 0 so the "market
  // was empty on this date" signal is preserved.
  if (capturedMeta) {
    const { error: searchSnapErr } = await supabase.from("search_snapshots").insert({
      platform: PLATFORM,
      market: MARKET,
      rv_class: null,
      source_url: sourceUrl,
      total_results: capturedMeta.total_results,
      total_unavailable: null,
      total_pages: capturedMeta.total_pages,
      price_min: null,
      price_max: null,
      price_average: null,
      price_median: null,
      price_histogram: capturedMeta.nightly_rate_histogram,
      length_histogram: capturedMeta.length_histogram,
      generator_histogram: capturedMeta.generator_histogram,
      fresh_water_tank_histogram: capturedMeta.fresh_water_tank_histogram,
      nightly_mileage_histogram: capturedMeta.nightly_mileage_histogram,
      raw_meta: capturedMeta,
    });
    if (searchSnapErr) {
      errors.push(`search_snapshot: ${searchSnapErr.message}`);
      log(`  search_snapshot FAILED: ${searchSnapErr.message}`);
    }
  }

  if (listings.length === 0) {
    log(`DONE — no listings (totalResults=${totalResults ?? "null"}, errors=${errors.length})`);
    return { totalResults, totalPages, unique: 0, upserted: 0, snapshots: 0, errors, sourceUrl };
  }

  // Build rows — full expanded schema (migration 005).
  const now = new Date().toISOString();
  const rows = listings
    .filter((l) => l.nightly_rate !== null && l.nightly_rate > 0)
    .map((l) => ({
      platform: PLATFORM,
      market: MARKET,
      rv_class: l.rv_class,
      listing_url: l.listing_url,
      host_name: null,
      rv_year: l.year,
      rv_make: l.make,
      rv_model: l.model,
      nightly_rate: l.nightly_rate,
      weekly_rate: null, // RVshare search response doesn't expose a direct weekly_rate
      review_count: l.review_count,
      avg_rating: l.avg_rating,
      amenities: [],
      scraped_at: now,
      last_seen_at: now,
      // Shared expansion columns
      sleeps: l.sleeps,
      length_ft: l.length_ft,
      instant_book: l.is_instant_book,
      delivery: l.delivery,
      primary_image_url: l.primary_image_url,
      // location_name is a "City, ST" free-text blob — don't store as city.
      location_city: null,
      location_state: l.location_state,
      location_lat: l.location_lat,
      location_lng: l.location_lng,
      // RVshare-only expansion columns
      insurance_status: l.insurance_status,
      electric_service: l.electric_service,
      fresh_water_tank: l.fresh_water_tank,
      generator_usage_included: l.generator_usage_included,
      nightly_mileage_included: l.nightly_mileage_included,
      distance_from_search_miles: l.distance_from_search_miles,
      owner_id: l.owner_id,
      premier_owner: l.premier_owner,
      guest_favorite: l.guest_favorite,
      new_listing_without_reviews: l.new_listing_without_reviews,
      weekly_discount_percent: l.weekly_discount_percent,
      monthly_discount_percent: l.monthly_discount_percent,
    }));

  // Upsert + snapshot in chunks (avoids request-size limits under UPSERT_CHUNK×50).
  let upserted = 0;
  let snapshots = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error: upErr } = await supabase
      .from("listings")
      .upsert(chunk, { onConflict: "listing_url", ignoreDuplicates: false });
    if (upErr) {
      errors.push(`upsert[${i}]: ${upErr.message}`);
      log(`  upsert chunk @${i} FAILED: ${upErr.message}`);
      continue;
    }
    upserted += chunk.length;

    // Separate SELECT matches the Outdoorsy backfill — the .upsert().select()
    // chain has been unreliable under our env-loaded local node path.
    const urls = chunk.map((r) => r.listing_url);
    const { data: fetched, error: fetchErr } = await supabase
      .from("listings")
      .select("id, listing_url, nightly_rate, weekly_rate, review_count, avg_rating")
      .in("listing_url", urls);
    if (fetchErr || !fetched) {
      errors.push(`select[${i}]: ${fetchErr?.message ?? "empty result"}`);
      continue;
    }
    const snaps = fetched.map((r) => ({
      listing_id: r.id,
      nightly_rate: r.nightly_rate,
      weekly_rate: r.weekly_rate ?? null,
      review_count: r.review_count ?? null,
      avg_rating: r.avg_rating ?? null,
      source_url: sourceUrl,
    }));
    const { error: snapErr } = await supabase.from("listing_snapshots").insert(snaps);
    if (snapErr) {
      errors.push(`snapshot[${i}]: ${snapErr.message}`);
      log(`  snapshot chunk @${i} FAILED: ${snapErr.message}`);
    } else {
      snapshots += snaps.length;
    }
  }

  // Per-class summary — useful for spot-checking the backend's shared-universe
  // behavior against the old per-type cron attribution.
  const byClass = new Map();
  for (const r of rows) byClass.set(r.rv_class, (byClass.get(r.rv_class) ?? 0) + 1);

  log(
    `DONE — totalResults=${totalResults} unique=${listings.length} rows=${rows.length} upserted=${upserted} snapshots=${snapshots} errors=${errors.length} (${pagesFetched} pages)`,
  );
  log(`  class breakdown:`);
  for (const [cls, n] of [...byClass.entries()].sort((a, b) => b[1] - a[1])) {
    log(`    ${cls.padEnd(16)} ${n}`);
  }

  return {
    totalResults: totalResults ?? 0,
    totalPages,
    unique: listings.length,
    upserted,
    snapshots,
    errors,
    sourceUrl,
    byClass: Object.fromEntries(byClass),
  };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date();
  console.log(`RVshare SD backfill (direct API) started ${startedAt.toISOString()}`);
  console.log(`Location: "${LOCATION}"  Max pages: ${MAX_PAGES}`);

  const result = await sweepMarket();

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  console.log("\n═══ SUMMARY ═══");
  console.log(`Duration:        ${Math.round(durationMs / 1000)}s`);
  console.log(`Universe:        ${result.totalResults} listings (per pagination.totalResults)`);
  console.log(`Unique:          ${result.unique}`);
  console.log(`Upserted:        ${result.upserted}`);
  console.log(`Snapshots:       ${result.snapshots}`);
  console.log(`Errors:          ${result.errors.length}`);
  if (result.errors.length) {
    console.log("\nErrors:");
    for (const e of result.errors) console.log(`  - ${e}`);
  }

  const status =
    result.errors.length === 0 ? "success" : result.upserted > 0 ? "partial" : "failure";
  const { error: logErr } = await supabase.from("cron_runs").insert({
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    market: MARKET,
    platform: "rvshare-backfill-api",
    status,
    listings_upserted: result.upserted,
    snapshots_inserted: result.snapshots,
    skipped_not_rv: 0,
    error_count: result.errors.length,
    errors: result.errors.length ? result.errors : null,
    error_message: null,
  });
  if (logErr) console.error(`cron_runs insert failed: ${logErr.message}`);
  else console.log(`\ncron_runs logged (platform=rvshare-backfill-api, status=${status})`);

  process.exit(result.errors.length && result.upserted === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
