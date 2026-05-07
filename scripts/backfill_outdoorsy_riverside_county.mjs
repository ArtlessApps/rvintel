#!/usr/bin/env node
// Outdoorsy Riverside County backfill — direct JSON:API (2026-05-07).
//
// Mirrors backfill_outdoorsy_sd.mjs exactly — only MARKET and ADDRESS differ.
// See that script for the full methodology notes.
//
// Usage:
//   node scripts/backfill_outdoorsy_riverside_county.mjs

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── env loader ────────────────────────────────────────────────────────────────
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
const MARKET = "riverside-county-ca";
const PLATFORM = "outdoorsy";
const ADDRESS = "Riverside County, CA";
const PAGE_SIZE = 24;
const PAGE_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 15_000;
const UPSERT_CHUNK = 50;

const CLASSES = [
  { code: "a",           rv_class: "Class A" },
  { code: "b",           rv_class: "Class B" },
  { code: "c",           rv_class: "Class C" },
  { code: "trailer",     rv_class: "Travel Trailer" },
  { code: "fifth-wheel", rv_class: "Fifth Wheel" },
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── fetch helpers ─────────────────────────────────────────────────────────────

function backendUrl(classCode, pageOffset) {
  const u = new URL("https://search.outdoorsy.com/rentals");
  u.searchParams.set("address", ADDRESS);
  u.searchParams.set("filter[type]", classCode);
  u.searchParams.set("page[limit]", String(PAGE_SIZE));
  u.searchParams.set("page[offset]", String(pageOffset));
  return u.toString();
}

function uiUrl(classCode) {
  const u = new URL("https://www.outdoorsy.com/rv-search");
  u.searchParams.set("address", ADDRESS);
  u.searchParams.set("manual_address_input", "false");
  u.searchParams.set("filter[renter_age]", "25");
  u.searchParams.set("skip_defaults", "true");
  u.searchParams.set("filter[type]", classCode);
  return u.toString();
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/vnd.api+json, application/json",
        Origin: "https://www.outdoorsy.com",
        Referer: "https://www.outdoorsy.com/",
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

// ── normalizer (mirror of lib/outdoorsy-api.ts#normalizeRental) ───────────────
const asNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asStr = (v) => (typeof v === "string" && v.trim() !== "" ? v : null);
const asBool = (v) => (typeof v === "boolean" ? v : null);
const asTs = (v) => {
  const s = asStr(v);
  if (s === null) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return s;
};

function normalizeRental(raw) {
  const a = raw.attributes ?? {};
  const loc = a.location ?? {};
  const slug = asStr(a.slug);
  const listing_url = slug
    ? `https://www.outdoorsy.com${slug}`
    : `https://www.outdoorsy.com/rv-rental/listing/${raw.id}`;

  let avg_rating = null;
  if (Array.isArray(a.average_reviews?.rental) && a.average_reviews.rental.length > 0) {
    const s = Number(a.average_reviews.rental[0]?.score);
    if (Number.isFinite(s)) avg_rating = s;
  }
  const review_count = asNum(a.reviews_num);

  return {
    id: raw.id,
    listing_url,
    display_vehicle_type: asStr(a.display_vehicle_type),
    vehicle_year: asNum(a.vehicle_year),
    vehicle_make: asStr(a.vehicle_make),
    vehicle_model: asStr(a.vehicle_model),
    price_per_day_cents: asNum(a.price_per_day),
    price_per_week_cents: asNum(a.price_per_week),
    avg_rating,
    review_count,
    sleeps: asNum(a.sleeps),
    sleeps_adults: asNum(a.sleeps_adults),
    sleeps_kids: asNum(a.sleeps_kids),
    instant_book: asBool(a.instant_book),
    minimum_days: asNum(a.minimum_days),
    cancel_policy: asStr(a.cancel_policy),
    delivery: asBool(a.delivery),
    delivery_radius_miles: asNum(a.DeliveryRadiusMiles),
    vehicle_length: asNum(a.vehicle_length),
    vehicle_height: asNum(a.vehicle_height),
    vehicle_dry_weight: asNum(a.vehicle_dry_weight),
    vehicle_gvwr: asNum(a.vehicle_gvwr),
    primary_image_url: asStr(a.primary_image_url),
    location_city: asStr(loc.city),
    location_state: asStr(loc.state),
    location_zip: asStr(loc.zip),
    location_lat: asNum(loc.lat),
    location_lng: asNum(loc.lng),
    first_published: asTs(a.first_published),
    last_published: asTs(a.last_published),
    rental_score: asNum(a.rental_score),
    sort_score: asNum(a.sort_score),
  };
}

const centsToDollars = (v) => (v === null ? null : v / 100);

function normalizeMeta(rawMeta) {
  const m = rawMeta ?? {};
  const hist = m.price_histogram ?? {};
  return {
    total: asNum(m.total),
    price_min: centsToDollars(asNum(m.price_min)),
    price_max: centsToDollars(asNum(m.price_max)),
    price_average: centsToDollars(asNum(m.price_average)),
    price_median: centsToDollars(asNum(m.price_median)),
    price_histogram: Array.isArray(hist?.data) ? hist.data : null,
    total_unavailable: asNum(m.total_unavailable),
  };
}

// ── per-class sweep ───────────────────────────────────────────────────────────
async function sweepClass(classCfg) {
  const log = (msg) => console.log(`[${classCfg.code}] ${msg}`);
  const sourceUrl = uiUrl(classCfg.code);

  const listings = [];
  const seenIds = new Set();
  let total = null;
  let latestMeta = null;
  let pagesFetched = 0;
  const errors = [];

  for (let page = 0; page < 60; page++) {
    const offset = page * PAGE_SIZE;
    let json;
    try {
      json = await fetchPage(backendUrl(classCfg.code, offset));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`page@${offset}: ${msg}`);
      log(`  page@${offset} FAILED — ${msg}`);
      break;
    }
    pagesFetched++;
    latestMeta = normalizeMeta(json.meta);
    if (total === null) total = latestMeta.total;
    const data = Array.isArray(json.data) ? json.data : [];
    let newThisPage = 0;
    for (const raw of data) {
      if (seenIds.has(raw.id)) continue;
      seenIds.add(raw.id);
      listings.push(normalizeRental(raw));
      newThisPage++;
    }
    log(`  page@${offset}: got ${data.length}, new ${newThisPage}, cum ${listings.length}${total !== null ? `/${total}` : ""}`);
    if (data.length < PAGE_SIZE) break;
    if (total !== null && listings.length >= total) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  if (latestMeta) {
    const { error: searchSnapErr } = await supabase.from("search_snapshots").insert({
      platform: PLATFORM,
      market: MARKET,
      rv_class: classCfg.rv_class,
      source_url: sourceUrl,
      total_results: latestMeta.total,
      total_unavailable: latestMeta.total_unavailable,
      total_pages: null,
      price_min: latestMeta.price_min,
      price_max: latestMeta.price_max,
      price_average: latestMeta.price_average,
      price_median: latestMeta.price_median,
      price_histogram: latestMeta.price_histogram,
      length_histogram: null,
      generator_histogram: null,
      fresh_water_tank_histogram: null,
      nightly_mileage_histogram: null,
      raw_meta: latestMeta,
    });
    if (searchSnapErr) {
      errors.push(`search_snapshot: ${searchSnapErr.message}`);
      log(`  search_snapshot FAILED: ${searchSnapErr.message}`);
    }
  }

  if (listings.length === 0) {
    log(`DONE — no listings (meta.total=${total ?? "null"}, errors=${errors.length})`);
    return { code: classCfg.code, total, unique: 0, upserted: 0, snapshots: 0, errors };
  }

  const now = new Date().toISOString();
  const rows = listings
    .filter((l) => l.price_per_day_cents !== null && l.price_per_day_cents > 0)
    .map((l) => ({
      platform: PLATFORM,
      market: MARKET,
      rv_class: classCfg.rv_class,
      listing_url: l.listing_url,
      host_name: null,
      rv_year: l.vehicle_year,
      rv_make: l.vehicle_make,
      rv_model: l.vehicle_model,
      nightly_rate: l.price_per_day_cents / 100,
      weekly_rate: l.price_per_week_cents !== null ? l.price_per_week_cents / 100 : null,
      review_count: l.review_count,
      avg_rating: l.avg_rating,
      amenities: [],
      scraped_at: now,
      last_seen_at: now,
      sleeps: l.sleeps,
      length_ft: l.vehicle_length,
      instant_book: l.instant_book,
      delivery: l.delivery,
      primary_image_url: l.primary_image_url,
      location_city: l.location_city,
      location_state: l.location_state,
      location_lat: l.location_lat,
      location_lng: l.location_lng,
      sleeps_adults: l.sleeps_adults,
      sleeps_kids: l.sleeps_kids,
      minimum_days: l.minimum_days,
      cancel_policy: l.cancel_policy,
      delivery_radius_miles: l.delivery_radius_miles,
      vehicle_height: l.vehicle_height,
      vehicle_dry_weight: l.vehicle_dry_weight,
      vehicle_gvwr: l.vehicle_gvwr,
      location_zip: l.location_zip,
      first_published: l.first_published,
      last_published: l.last_published,
      rental_score: l.rental_score,
      sort_score: l.sort_score,
    }));

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

  log(`DONE — total=${total} unique=${listings.length} rows=${rows.length} upserted=${upserted} snapshots=${snapshots} errors=${errors.length} (${pagesFetched} pages)`);
  return { code: classCfg.code, total: total ?? 0, unique: listings.length, upserted, snapshots, errors };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date();
  console.log(`Outdoorsy Riverside County backfill (direct API) started ${startedAt.toISOString()}`);
  console.log(`Classes: ${CLASSES.map((c) => c.code).join(", ")}  Address: "${ADDRESS}"`);

  const results = [];
  for (let i = 0; i < CLASSES.length; i++) {
    console.log(`── sweeping ${CLASSES[i].rv_class} (filter[type]=${CLASSES[i].code}) ──`);
    results.push(await sweepClass(CLASSES[i]));
    if (i < CLASSES.length - 1) await new Promise((r) => setTimeout(r, 1_000));
  }

  const totals = results.reduce(
    (acc, r) => ({
      total: acc.total + (r.total || 0),
      unique: acc.unique + r.unique,
      upserted: acc.upserted + r.upserted,
      snapshots: acc.snapshots + r.snapshots,
      errors: [...acc.errors, ...r.errors.map((e) => `${r.code}: ${e}`)],
    }),
    { total: 0, unique: 0, upserted: 0, snapshots: 0, errors: [] },
  );

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  console.log("\n═══ SUMMARY ═══");
  console.log(`Duration:   ${Math.round(durationMs / 1000)}s`);
  console.log(`Universe:   ${totals.total} listings (per meta.total)`);
  console.log(`Unique:     ${totals.unique}`);
  console.log(`Upserted:   ${totals.upserted}`);
  console.log(`Snapshots:  ${totals.snapshots}`);
  console.log(`Errors:     ${totals.errors.length}`);
  for (const r of results) {
    console.log(`  ${r.code.padEnd(12)} total=${r.total} unique=${r.unique} upserted=${r.upserted} snapshots=${r.snapshots} errors=${r.errors.length}`);
  }
  if (totals.errors.length) {
    console.log("\nErrors:");
    for (const e of totals.errors) console.log(`  - ${e}`);
  }

  const status =
    totals.errors.length === 0 ? "success" : totals.upserted > 0 ? "partial" : "failure";
  const { error: logErr } = await supabase.from("cron_runs").insert({
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    market: MARKET,
    platform: "outdoorsy-backfill-api",
    status,
    listings_upserted: totals.upserted,
    snapshots_inserted: totals.snapshots,
    skipped_not_rv: 0,
    error_count: totals.errors.length,
    errors: totals.errors.length ? totals.errors : null,
    error_message: null,
  });
  if (logErr) console.error(`cron_runs insert failed: ${logErr.message}`);
  else console.log(`\ncron_runs logged (platform=outdoorsy-backfill-api, status=${status})`);

  process.exit(totals.errors.length && totals.upserted === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
