import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;
import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  fetchOutdoorsyClass,
  outdoorsyUiUrl,
  displayVehicleTypeToRvClass,
  OUTDOORSY_CODE_TO_RV_CLASS,
  type OutdoorsyClassCode,
  type OutdoorsyListing,
} from "@/lib/outdoorsy-api";
import { fetchRvshareMarket, type RvshareListing } from "@/lib/rvshare-api";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// ─── Market / class config ────────────────────────────────────────────────────
// Both platforms now ingest via direct JSON:API (Outdoorsy pivoted 2026-04-22,
// RVshare pivoted 2026-04-22 — see PRD §11). Firecrawl config survives as a
// dormant fallback behind `*_SCRAPER=firecrawl` env flags in case either
// backend is ever gated.
//
// RVshare `type=` was proven COSMETIC during the pivot: all 8 pre-pivot per-
// type targets returned the same 1,283 SD listings in the same order. The API
// path makes one location-scoped sweep and categorizes each listing from
// `attributes.type`, eliminating 7 redundant cron calls per day.

type ScrapeTarget = { platform: "outdoorsy" | "rvshare"; url: string; group?: string };

// RVshare Firecrawl fallback targets. Only touched when RVSHARE_SCRAPER=firecrawl.
// Kept at the pre-pivot 8 per-type URLs even though we now know the backend
// ignored `type` — the Firecrawl path relies on the headless browser's
// client-side JS to apply the `type` filter visually, so these URLs were
// doing real work on that code path (via LLM-classified page output) even if
// the underlying HTTP response was type-blind. If you ever flip back, be
// aware you'll be paying 8× the Firecrawl credits for <2× the distinct
// listings vs a single API sweep.
const MARKET_TARGETS: Record<string, ScrapeTarget[]> = {
  "san-diego-ca": [
    { platform: "rvshare", group: "1", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=class-a" },
    { platform: "rvshare", group: "1", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=class-b" },
    { platform: "rvshare", group: "1", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=class-c" },
    { platform: "rvshare", group: "1", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=travel-trailer" },
    { platform: "rvshare", group: "2", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=fifth-wheel" },
    { platform: "rvshare", group: "2", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=toy-hauler" },
    { platform: "rvshare", group: "2", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=pop-up" },
    { platform: "rvshare", group: "2", url: "https://rvshare.com/rv-rental?location=san+diego+ca&type=truck-camper" },
  ],
};

// RVshare direct-API targets. One entry per market — the backend returns the
// full type-agnostic universe for a location in a single paginated sweep.
type RvshareApiTarget = { location: string };
const RVSHARE_API_TARGETS: Record<string, RvshareApiTarget> = {
  "san-diego-ca": { location: "san diego ca" },
};

// ─── Outdoorsy direct-API targets (active as of 2026-04-22) ──────────────────
// Backend filter codes differ from UI codes. The UI-shaped URL is still used
// for listing_snapshots.source_url to preserve historical join-compatibility.
type OutdoorsyApiTarget = {
  address: string;
  classCode: OutdoorsyClassCode;
  group: string;
};

const OUTDOORSY_API_TARGETS: Record<string, OutdoorsyApiTarget[]> = {
  "san-diego-ca": [
    // Group 1 — smaller classes paired for cron budget balance.
    { address: "San Diego, CA", classCode: "a", group: "1" },
    { address: "San Diego, CA", classCode: "b", group: "1" },
    // Group 2 — larger classes. 411 Class C + 692 travel trailer + 56 fifth-wheel
    // at ~300ms per page stays well under the 300s function cap.
    { address: "San Diego, CA", classCode: "c", group: "2" },
    { address: "San Diego, CA", classCode: "trailer", group: "2" },
    { address: "San Diego, CA", classCode: "fifth-wheel", group: "2" },
  ],
};

// Dormant fallback: used only when OUTDOORSY_SCRAPER=firecrawl. Same shape as
// the pre-2026-04-22 config. Keeps the old code path alive as insurance against
// the direct-API endpoint being shut down or gated.
const OUTDOORSY_FIRECRAWL_TARGETS: Record<string, ScrapeTarget[]> = {
  "san-diego-ca": [
    { platform: "outdoorsy", group: "1", url: "https://www.outdoorsy.com/rv-search?address=San+Diego%2C+CA&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=b" },
    { platform: "outdoorsy", group: "1", url: "https://www.outdoorsy.com/rv-search?address=San+Diego%2C+CA&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=a" },
    { platform: "outdoorsy", group: "2", url: "https://www.outdoorsy.com/rv-search?address=San+Diego%2C+CA&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=c" },
    // NB: filter[type]=tt silently returns 0 via the backend API (see PRD §11
    // 2026-04-22). This UI URL is preserved verbatim from the pre-pivot config
    // so the fallback remains byte-identical; if ever activated, it inherits
    // the same under-counting bug it did before. Fix would be to add a
    // `trailer` UI URL, but we accept the stale fallback in exchange for not
    // actively maintaining two codepaths.
    { platform: "outdoorsy", group: "2", url: "https://www.outdoorsy.com/rv-search?address=San+Diego%2C+CA&manual_address_input=false&filter%5Brenter_age%5D=25&skip_defaults=true&filter%5Btype%5D=tt" },
  ],
};

// ─── Extraction schema ────────────────────────────────────────────────────────

const RV_CLASSES = [
  "Class A",
  "Class B",
  "Class C",
  "Travel Trailer",
  "Fifth Wheel",
  "Toy Hauler",
  "Pop Up",
  "Truck Camper",
  "Not an RV",
  "Other",
] as const;

type RvClass = (typeof RV_CLASSES)[number];

const ListingExtractSchema = z.object({
  listings: z.array(
    z.object({
      listing_url: z.string().describe("Full URL to the individual listing page"),
      host_name: z.string().optional().describe("Name of the host or rental company"),
      rv_class: z.enum(RV_CLASSES).describe(
        "Classify strictly by body style, not size or brand. " +
        "Class A = large bus/coach-style motorhome (flat front, huge windshield; Tiffin, Newmar, Fleetwood Bounder, Winnebago Vista). " +
        "Class B = van-based campervan with NO over-cab bed; the van roofline is continuous (Winnebago Travato/Solis/Revel, Airstream Interstate, Coachmen Galleria, Storyteller Overland, Mercedes Sprinter / Ford Transit / Ram Promaster conversions). " +
        "Class C = motorhome built on a cut-away van/truck chassis WITH a distinctive bed or storage cabover that hangs over the driver cab (Winnebago Minnie Winnie/View/Navion, Thor Four Winds/Chateau, Jayco Redhawk/Greyhawk, Coachmen Leprechaun). " +
        "Travel Trailer = towable, bumper pull, no motor. " +
        "Fifth Wheel = towable with a raised kingpin hitch that sits in a pickup bed. " +
        "Toy Hauler = trailer or motorhome with a rear ramp door/garage. " +
        "Pop Up = folding tent trailer. " +
        "Truck Camper = slide-in camper that sits in a pickup truck bed (Lance, Northern Lite, Four Wheel Campers, Palomino); the pickup cab is visible below the camper. " +
        "Not an RV = a bare pickup truck, SUV, car, sedan, or any tow vehicle with no camper body. If you only see a pickup truck with no camper mounted, return 'Not an RV'. " +
        "Other = anything that truly does not fit. Prefer a specific class over Other whenever possible."
      ),
      rv_title: z.string().optional().describe(
        "The full raw title/headline shown on the listing card, verbatim. " +
        "Example: '2019 Four Winds 26B' or 'FRANCES 2019 Thor Four Winds 26B'. " +
        "Include the complete text exactly as it appears — do not abbreviate or reword."
      ),
      rv_year: z.number().int().optional().describe("Model year of the RV"),
      rv_make: z.string().optional().describe(
        "Brand/series name as shown, e.g. 'Four Winds', 'Travato', 'Minnie Winnie'. " +
        "Prefer the RV series over the underlying chassis manufacturer. " +
        "If the listing says 'Thor Four Winds', rv_make is 'Four Winds' (not 'Thor')."
      ),
      rv_model: z.string().optional().describe("Model/floorplan code, e.g. '26B', '59K', '22A'"),
      nightly_rate: z.number().describe("Nightly rental rate in USD (number only)"),
      weekly_rate: z.number().optional().describe("Weekly rental rate in USD if shown"),
      review_count: z.number().int().optional().describe("Total number of reviews"),
      avg_rating: z.number().optional().describe("Average star rating out of 5"),
      amenities: z.array(z.string()).optional().describe("List of amenities shown on the card"),
    })
  ),
});

// ─── Deterministic make/model → class lookup ─────────────────────────────────
// Applied AFTER the LLM classifies. Beats vision guesses for the common fleet.

const MAKE_MODEL_CLASS_RULES: { match: RegExp; class: RvClass }[] = [
  // Class B — van conversions
  { match: /\b(travato|solis|revel|ekko\s*22|era|boldt)\b/i, class: "Class B" },
  { match: /\b(airstream\s+interstate|interstate\s+(ext|nineteen|lounge|grand))\b/i, class: "Class B" },
  { match: /\b(galleria|beyond)\b/i, class: "Class B" }, // Coachmen
  { match: /\b(storyteller|mode\s*lt|stealth\s*mode)\b/i, class: "Class B" },
  { match: /\b(thor\s+(sequence|tellaro|rize|scope|sanctuary)|tellaro|rize\s*\d)\b/i, class: "Class B" },
  { match: /\b(sportsmobile|advanced\s*rv|outside\s*van|texino|vanlife\s*customs)\b/i, class: "Class B" },
  { match: /\b((mercedes[-\s]*)?sprinter|(ford\s+)?transit|(ram\s+)?promaster|metris)\s+(camper|conversion|van)\b/i, class: "Class B" },
  // Class C — cab-over motorhomes
  { match: /\b(minnie\s*winnie|winnebago\s+view|navion|winnebago\s+(spirit|outlook|porto))\b/i, class: "Class C" },
  { match: /\b(four\s*winds|chateau|freedom\s*elite|quantum|axis|vegas)\b/i, class: "Class C" }, // Thor
  { match: /\b(redhawk|greyhawk|melbourne|seneca)\b/i, class: "Class C" }, // Jayco
  { match: /\b(leprechaun|cross\s*trek|freelander|prism)\b/i, class: "Class C" }, // Coachmen
  { match: /\b(sunseeker|forester|isata)\b/i, class: "Class C" }, // Forest River / Dynamax
  // Class A
  { match: /\b(tiffin|allegro|phaeton|zephyr|bus|newmar|dutch\s*star|mountain\s*aire|ventana|bay\s*star)\b/i, class: "Class A" },
  { match: /\b(winnebago\s+(vista|adventurer|sunstar|journey|tour|forza)|bounder|discovery|fleetwood\s+(bounder|pace|southwind))\b/i, class: "Class A" },
  { match: /\b(georgetown|pace\s*arrow|challenger|hurricane|palazzo)\b/i, class: "Class A" },
  // Travel Trailer
  { match: /\b(airstream\s+(bambi|basecamp|caravel|flying\s*cloud|globetrotter|international|classic))\b/i, class: "Travel Trailer" },
  { match: /\b(r[-\s]*pod|rockwood|flagstaff|jayflight|jay\s*flight|keystone\s+(bullet|hideout|passport|springdale))\b/i, class: "Travel Trailer" },
  { match: /\b(imagine|reflection|transcend|kodiak|wolf\s*pup|no[-\s]*boundaries|nobo)\b/i, class: "Travel Trailer" },
  { match: /\b(taxa|cricket|mantis|woolly\s*bear|tigermoth|happier\s*camper|casita|scamp|oliver)\b/i, class: "Travel Trailer" },
  // Fifth Wheel
  { match: /\b(fifth[-\s]*wheel|5th[-\s]*wheel|montana|cougar|cardinal|big\s*country|sabre|cedar\s*creek|reflection\s*\d{3}rl)\b/i, class: "Fifth Wheel" },
  // Toy Hauler
  { match: /\b(toy\s*hauler|fuzion|momentum|raptor|cyclone|stryker|outlaw)\b/i, class: "Toy Hauler" },
  // Truck Camper
  { match: /\b(truck\s*camper|lance\s*\d{3,4}|northern\s*lite|four\s*wheel\s*camper|palomino\s+(ss|backpack|real[-\s]*lite)|arctic\s*fox\s*camper|bigfoot\s*camper)\b/i, class: "Truck Camper" },
  // Pop Up
  { match: /\b(pop[-\s]*up|tent\s*trailer|a[-\s]*frame|aliner|clipper\s*classic|rockwood\s*(freedom|hw)|jay\s*sport)\b/i, class: "Pop Up" },
];

function classifyFromText(haystack: string): RvClass | null {
  for (const rule of MAKE_MODEL_CLASS_RULES) {
    if (rule.match.test(haystack)) return rule.class;
  }
  return null;
}

function finalClass(
  llmClass: RvClass | undefined,
  title: string | undefined | null,
  make: string | undefined | null,
  model: string | undefined | null,
  listingUrl: string
): RvClass {
  const slug = (() => {
    try {
      return new URL(listingUrl).pathname.toLowerCase();
    } catch {
      return listingUrl.toLowerCase();
    }
  })();

  // Combine every text signal the LLM gave us so a brand name lands a match
  // even if it gets swapped between make/model/title fields.
  const haystack = [title ?? "", make ?? "", model ?? "", slug].join(" ");

  // Deterministic lookup wins over the LLM for known make/models.
  const fromTable = classifyFromText(haystack);
  if (fromTable) return fromTable;

  // Otherwise trust the LLM's classification if it's one of the enum values.
  if (llmClass && (RV_CLASSES as readonly string[]).includes(llmClass)) return llmClass;

  return "Other";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev: no secret set = open
  const header = req.headers.get("x-vercel-cron") ?? req.headers.get("authorization");
  return header === cronSecret || header === `Bearer ${cronSecret}`;
}

// ─── Outdoorsy direct-API scrape path ─────────────────────────────────────────
// New in 2026-04-22. Replaces the Firecrawl+LLM path for Outdoorsy. See PRD §11.
// Returns the same aggregate shape as scrapeMarket() so the route handler is
// indifferent to which platform/path was used.

async function scrapeOutdoorsyViaApi(
  market: string,
  groupFilter: string | undefined,
): Promise<{ inserted: number; snapshotsInserted: number; skipped: number; errors: string[] }> {
  const targets = (OUTDOORSY_API_TARGETS[market] ?? []).filter(
    (t) => !groupFilter || t.group === groupFilter,
  );
  if (targets.length === 0) {
    return { inserted: 0, snapshotsInserted: 0, skipped: 0, errors: [] };
  }

  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let inserted = 0;
  let snapshotsInserted = 0;
  let skipped = 0;

  // Serial execution across classes. Each class is ~5-15s (pageSize=24, ~300ms
  // between pages, ~15-29 pages for the busiest SD classes), so even the full
  // 5-class sweep completes well inside the 300s function cap. Serial matters
  // less for rate-limit avoidance than it did on Firecrawl, but it gives us a
  // cleaner per-class error boundary in `cron_runs`.
  for (const target of targets) {
    const label = `outdoorsy ${target.classCode}`;
    try {
      const { listings, meta, pagesFetched, sourceUrl } = await fetchOutdoorsyClass({
        address: target.address,
        classCode: target.classCode,
        pageSize: 24,
        delayMs: 250,
        fetchTimeoutMs: 15_000,
      });

      if (listings.length === 0) {
        errors.push(`${label}: api returned 0 listings (meta.total=${meta.total}, pages=${pagesFetched})`);
        continue;
      }

      // Map API listings → listings table rows. Price fields on the API are in
      // cents; our schema stores dollars in nightly_rate / weekly_rate.
      // Every "expanded" field below is one the JSON:API already returned on
      // this exact request — persisting them costs zero extra API calls and
      // unlocks Phase 3 enrichment / Phase 4.5 kNN comp-sets at query time.
      const now = new Date().toISOString();
      const rows = listings
        .filter((l): l is OutdoorsyListing & { price_per_day_cents: number } => {
          return typeof l.price_per_day_cents === "number" && l.price_per_day_cents > 0;
        })
        .map((l) => {
          // display_vehicle_type is per-listing ground truth; fall back to the
          // class we queried for (it's the same thing 99% of the time).
          const rvClass =
            displayVehicleTypeToRvClass(l.display_vehicle_type) ??
            OUTDOORSY_CODE_TO_RV_CLASS[target.classCode];
          return {
            platform: "outdoorsy" as const,
            market,
            rv_class: rvClass,
            listing_url: l.listing_url,
            host_name: null,
            rv_year: l.vehicle_year,
            rv_make: l.vehicle_make,
            rv_model: l.vehicle_model,
            nightly_rate: l.price_per_day_cents / 100,
            weekly_rate: l.price_per_week_cents !== null ? l.price_per_week_cents / 100 : null,
            review_count: l.review_count,
            avg_rating: l.avg_rating,
            amenities: [] as string[],
            scraped_at: now,
            last_seen_at: now,
            // Shared expansion columns (migration 005)
            sleeps: l.sleeps,
            length_ft: l.vehicle_length,
            instant_book: l.instant_book,
            delivery: l.delivery,
            primary_image_url: l.primary_image_url,
            location_city: l.location_city,
            location_state: l.location_state,
            location_lat: l.location_lat,
            location_lng: l.location_lng,
            // Outdoorsy-only expansion columns
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
          };
        });

      skipped += listings.length - rows.length;
      if (rows.length === 0) continue;

      // Dedupe — defensive; the API already returns unique IDs per class query.
      const seen = new Set<string>();
      const deduped = rows.filter((r) => {
        if (seen.has(r.listing_url)) return false;
        seen.add(r.listing_url);
        return true;
      });

      const { data: upserted, error: upErr } = await supabase
        .from("listings")
        .upsert(deduped, { onConflict: "listing_url", ignoreDuplicates: false })
        .select("id, listing_url, nightly_rate, weekly_rate, review_count, avg_rating");

      if (upErr) {
        errors.push(`${label} upsert: ${upErr.message}`);
        continue;
      }

      inserted += deduped.length;

      if (upserted && upserted.length > 0) {
        const snapshots = upserted.map((r) => ({
          listing_id: r.id as string,
          nightly_rate: r.nightly_rate as number,
          weekly_rate: (r.weekly_rate ?? null) as number | null,
          review_count: (r.review_count ?? null) as number | null,
          avg_rating: (r.avg_rating ?? null) as number | null,
          source_url: sourceUrl,
        }));
        const { error: snapErr } = await supabase.from("listing_snapshots").insert(snapshots);
        if (snapErr) {
          errors.push(`${label} snapshot: ${snapErr.message}`);
        } else {
          snapshotsInserted += snapshots.length;
        }
      }

      // Market-wide meta snapshot — one row per (platform, market, rv_class,
      // cron run). Outdoorsy queries are per-class so rv_class is NOT NULL
      // here. Failure to write this is a soft error — the per-listing data
      // has already landed above.
      const rvClassForSnapshot = OUTDOORSY_CODE_TO_RV_CLASS[target.classCode];
      const { error: searchSnapErr } = await supabase.from("search_snapshots").insert({
        platform: "outdoorsy",
        market,
        rv_class: rvClassForSnapshot,
        source_url: sourceUrl,
        total_results: meta.total,
        total_unavailable: meta.total_unavailable,
        total_pages: null,
        price_min: meta.price_min,
        price_max: meta.price_max,
        price_average: meta.price_average,
        price_median: meta.price_median,
        price_histogram: meta.price_histogram,
        length_histogram: null,
        generator_histogram: null,
        fresh_water_tank_histogram: null,
        nightly_mileage_histogram: null,
        raw_meta: meta,
      });
      if (searchSnapErr) {
        errors.push(`${label} search_snapshot: ${searchSnapErr.message}`);
      }
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { inserted, snapshotsInserted, skipped, errors };
}

// ─── RVshare direct-API scrape path ───────────────────────────────────────────
// New in 2026-04-22. Replaces the Firecrawl+LLM path for RVshare. See PRD §11.
// One location-scoped call per market returns the full type-agnostic universe;
// we classify each listing from `attributes.type` and upsert in one batch.
//
// `groupFilter` is accepted for backward cron-path compatibility (rvshare-1,
// rvshare-2) but is IGNORED on the API path — the groups only existed to
// spread the Firecrawl 8-target load across two cron windows. A single API
// sweep completes in ~50s end-to-end and needs no grouping.
async function scrapeRvshareViaApi(
  market: string,
  _groupFilter: string | undefined,
): Promise<{ inserted: number; snapshotsInserted: number; skipped: number; errors: string[] }> {
  const target = RVSHARE_API_TARGETS[market];
  if (!target) {
    return { inserted: 0, snapshotsInserted: 0, skipped: 0, errors: [`no rvshare api target for market ${market}`] };
  }

  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let inserted = 0;
  let snapshotsInserted = 0;
  let skipped = 0;
  const label = `rvshare api ${market}`;

  try {
    // maxPages=80 is a safety cap; RVshare reports ~65 pages for SD. delayMs
    // 200 keeps us far under any conceivable rate limit (we've seen 0 errors
    // across full 65-page sweeps at this cadence). fetchTimeoutMs 15s is the
    // same as Outdoorsy.
    const { listings, meta, pagesFetched, sourceUrl } = await fetchRvshareMarket({
      location: target.location,
      maxPages: 80,
      delayMs: 200,
      fetchTimeoutMs: 15_000,
    });

    if (listings.length === 0) {
      errors.push(`${label}: api returned 0 listings (totalResults=${meta.totalResults}, pages=${pagesFetched})`);
      return { inserted, snapshotsInserted, skipped, errors };
    }

    // Map API listings → listings table rows. RVshare `rate` is already in
    // dollars (unlike Outdoorsy's cents); no divide-by-100. Every "expanded"
    // field below is one the search-page JSON was already returning on this
    // exact request — persisting them costs zero extra API calls.
    const now = new Date().toISOString();
    const rows = listings
      .filter((l): l is RvshareListing & { nightly_rate: number } => {
        return typeof l.nightly_rate === "number" && l.nightly_rate > 0;
      })
      .map((l) => ({
        platform: "rvshare" as const,
        market,
        rv_class: l.rv_class,
        listing_url: l.listing_url,
        host_name: null,
        rv_year: l.year,
        rv_make: l.make,
        rv_model: l.model,
        nightly_rate: l.nightly_rate,
        weekly_rate: null, // RVshare search response has no direct weekly_rate
        review_count: l.review_count,
        avg_rating: l.avg_rating,
        amenities: [] as string[],
        scraped_at: now,
        last_seen_at: now,
        // Shared expansion columns (migration 005)
        sleeps: l.sleeps,
        length_ft: l.length_ft,
        instant_book: l.is_instant_book,
        delivery: l.delivery,
        primary_image_url: l.primary_image_url,
        // RVshare doesn't expose a parsed city string — location.name is a
        // free-text "City, ST" blob (e.g. "Chula Vista, CA"). Leave city
        // NULL rather than storing the unparsed blob under a wrong column.
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

    skipped += listings.length - rows.length;
    if (rows.length === 0) {
      return { inserted, snapshotsInserted, skipped, errors };
    }

    // Dedupe by listing_url. Defensive — we saw ~4 cross-page dupes out of
    // 1,283 on the RVshare backfill (backend shuffles boundary slightly).
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      if (seen.has(r.listing_url)) return false;
      seen.add(r.listing_url);
      return true;
    });

    // Chunked upsert — Supabase upsert payload ceiling sits well above our
    // row count at 50-chunks, but keeping this symmetric with the backfill
    // script means a single mental model for both call sites.
    const UPSERT_CHUNK = 100;
    const upsertedIds: Array<{
      id: string;
      nightly_rate: number;
      weekly_rate: number | null;
      review_count: number | null;
      avg_rating: number | null;
      listing_url: string;
    }> = [];

    for (let i = 0; i < deduped.length; i += UPSERT_CHUNK) {
      const chunk = deduped.slice(i, i + UPSERT_CHUNK);
      const { data: upserted, error: upErr } = await supabase
        .from("listings")
        .upsert(chunk, { onConflict: "listing_url", ignoreDuplicates: false })
        .select("id, listing_url, nightly_rate, weekly_rate, review_count, avg_rating");

      if (upErr) {
        errors.push(`${label} upsert[${i}]: ${upErr.message}`);
        continue;
      }
      inserted += chunk.length;
      if (upserted) {
        for (const r of upserted) {
          upsertedIds.push({
            id: r.id as string,
            nightly_rate: r.nightly_rate as number,
            weekly_rate: (r.weekly_rate ?? null) as number | null,
            review_count: (r.review_count ?? null) as number | null,
            avg_rating: (r.avg_rating ?? null) as number | null,
            listing_url: r.listing_url as string,
          });
        }
      }
    }

    if (upsertedIds.length > 0) {
      const snapshots = upsertedIds.map((r) => ({
        listing_id: r.id,
        nightly_rate: r.nightly_rate,
        weekly_rate: r.weekly_rate,
        review_count: r.review_count,
        avg_rating: r.avg_rating,
        source_url: sourceUrl,
      }));
      const { error: snapErr } = await supabase.from("listing_snapshots").insert(snapshots);
      if (snapErr) {
        errors.push(`${label} snapshot: ${snapErr.message}`);
      } else {
        snapshotsInserted += snapshots.length;
      }
    }

    // Market-wide meta snapshot — one row per (platform, market, cron run).
    // RVshare queries are type-agnostic (backend ignores `type=`) so rv_class
    // is NULL here; histograms describe the full-market distribution. Failure
    // to write this is a soft error — the per-listing data has already landed.
    const { error: searchSnapErr } = await supabase.from("search_snapshots").insert({
      platform: "rvshare",
      market,
      rv_class: null,
      source_url: sourceUrl,
      total_results: meta.totalResults,
      total_unavailable: null,
      total_pages: meta.totalPages,
      // RVshare doesn't expose price summary stats the way Outdoorsy does —
      // the nightly_rate histogram buckets are the only price signal.
      price_min: null,
      price_max: null,
      price_average: null,
      price_median: null,
      price_histogram: meta.nightly_rate_histogram,
      length_histogram: meta.length_histogram,
      generator_histogram: meta.generator_histogram,
      fresh_water_tank_histogram: meta.fresh_water_tank_histogram,
      nightly_mileage_histogram: meta.nightly_mileage_histogram,
      raw_meta: meta,
    });
    if (searchSnapErr) {
      errors.push(`${label} search_snapshot: ${searchSnapErr.message}`);
    }
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { inserted, snapshotsInserted, skipped, errors };
}

async function scrapeMarket(
  firecrawl: FirecrawlApp,
  market: string,
  platformFilter?: "outdoorsy" | "rvshare"
): Promise<{ inserted: number; snapshotsInserted: number; skipped: number; errors: string[] }> {
  // platformFilter can be "outdoorsy", "rvshare", "outdoorsy-1", "outdoorsy-2",
  // "rvshare-1", or "rvshare-2". Group suffix is a legacy artifact — ignored
  // on the API path for RVshare (the single-sweep API needs no grouping).
  const platformName = platformFilter?.split("-")[0] as "outdoorsy" | "rvshare" | undefined;
  const groupFilter = platformFilter?.includes("-") ? platformFilter.split("-")[1] : undefined;

  // Path selection per platform — direct JSON:API by default, Firecrawl as
  // fallback (env-flagged so we can flip without a deploy if a backend is gated).
  const outdoorsyMode =
    (process.env.OUTDOORSY_SCRAPER ?? "api").toLowerCase() === "firecrawl" ? "firecrawl" : "api";
  const rvshareMode =
    (process.env.RVSHARE_SCRAPER ?? "api").toLowerCase() === "firecrawl" ? "firecrawl" : "api";

  if (platformName === "outdoorsy" && outdoorsyMode === "api") {
    return scrapeOutdoorsyViaApi(market, groupFilter);
  }
  if (platformName === "rvshare" && rvshareMode === "api") {
    return scrapeRvshareViaApi(market, groupFilter);
  }

  // Below this point = Firecrawl path. Triggered only when at least one
  // platform is on `*_SCRAPER=firecrawl` or the target is on the Firecrawl-
  // only path. Under default config (both modes = "api") and a platform-
  // scoped invocation this block is never reached.
  const rvshareFirecrawlTargets = MARKET_TARGETS[market];
  if (!rvshareFirecrawlTargets) throw new Error(`Unknown market: ${market}`);
  const outdoorsyFirecrawlTargets = OUTDOORSY_FIRECRAWL_TARGETS[market] ?? [];

  const firecrawlRvshare = rvshareMode === "firecrawl" ? rvshareFirecrawlTargets : [];
  const firecrawlOutdoorsy = outdoorsyMode === "firecrawl" ? outdoorsyFirecrawlTargets : [];
  const allTargets: ScrapeTarget[] = [...firecrawlOutdoorsy, ...firecrawlRvshare];

  const targets = allTargets.filter(t => {
    if (!platformName) return true;
    if (t.platform !== platformName) return false;
    if (groupFilter && t.group !== groupFilter) return false;
    return true;
  });

  // Whole-market run (no platformFilter) + either platform on API mode: kick
  // those off in parallel and merge at the end. The Firecrawl loop below
  // handles the remaining platform(s) (if any) via standard iteration.
  const outdoorsyApiPromise =
    !platformName && outdoorsyMode === "api"
      ? scrapeOutdoorsyViaApi(market, undefined)
      : null;
  const rvshareApiPromise =
    !platformName && rvshareMode === "api"
      ? scrapeRvshareViaApi(market, undefined)
      : null;

  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let inserted = 0;
  let snapshotsInserted = 0;
  let skipped = 0;

  // How many pages to fetch per class per run. Intentionally low — coverage is
  // achieved across many daily cron runs, not by exhausting pagination in one shot.
  // JSON extraction takes 60–90s per page (LLM pass dominates). Per-cron budget:
  //   outdoorsy-{1,2}: 2 targets → 1 batch of 2 → ≤180s worst case.
  //   rvshare-{1,2}:   4 targets → 2 batches of 2 → typical ~90s, ceiling ~360s.
  // All well-fed runs stay inside the 300s Vercel function cap in practice.
  const MAX_PAGES: Record<string, number> = { outdoorsy: 1, rvshare: 1 };
  // Outdoorsy shows 12 listings/page; stop paginating if a page returns fewer than this.
  const MIN_PAGE_RESULTS = 5;

  const VALID_DOMAINS: Record<string, string> = { outdoorsy: "outdoorsy.com", rvshare: "rvshare.com" };

  function buildPageUrl(baseUrl: string, platform: string, page: number): string {
    const u = new URL(baseUrl);
    if (page === 0) return u.toString();
    if (platform === "outdoorsy") {
      u.searchParams.set("page[offset]", String(page * 12));
    } else {
      u.searchParams.set("page", String(page + 1));
    }
    return u.toString();
  }

  const EXTRACTION_PROMPT =
    "Extract every RV rental listing visible on the page. For each listing return: listing_url, host_name, rv_title (verbatim), rv_year, rv_make, rv_model, nightly_rate, weekly_rate, review_count, avg_rating, amenities, and rv_class.\n\n" +
    "CRITICAL — listing_url must be a real, complete URL from the page (e.g. https://www.outdoorsy.com/rentals/... or https://rvshare.com/rv-rental/...). NEVER invent, guess, or use placeholder URLs like example.com, /rv1, /rv2, or any made-up path. If you cannot find the real URL for a listing, omit that listing entirely rather than fabricating a URL.\n\n" +
    "ALWAYS include rv_title copied word-for-word from the listing card headline (e.g. '2019 Four Winds 26B'). This is required — do not skip it.\n\n" +
    "CRITICAL — model/floorplan codes are NOT class designators:\n" +
    "A trailing letter like A, B, C, E, F, G, J, K, M after a number is a FLOORPLAN code, not an RV class. '26B', '22E', '30A', '24F', '59K' say nothing about class. IGNORE those letters when classifying. Classify only from the body style (photo) and the brand/series name.\n\n" +
    "CLASSIFICATION RULES — be precise. Decide rv_class from the photo and the brand/series:\n" +
    "- Class A: large bus-style coach with flat front and huge windshield. Examples: Tiffin Allegro, Newmar Dutch Star, Fleetwood Bounder, Winnebago Vista/Adventurer, Thor Hurricane.\n" +
    "- Class B: van-sized campervan with a CONTINUOUS van roofline and NO bed hanging over the cab. Examples: Winnebago Travato/Solis/Revel/Ekko 22, Airstream Interstate, Coachmen Galleria, Storyteller Overland, Thor Sequence/Tellaro, any Mercedes Sprinter / Ford Transit / Ram Promaster conversion.\n" +
    "- Class C: motorhome on a cut-away van/truck chassis with a VERY DISTINCTIVE bed or storage bump that juts out OVER the driver cab. Examples: Winnebago Minnie Winnie/View/Navion, Thor Four Winds/Chateau/Quantum/Freedom Elite, Jayco Redhawk/Greyhawk/Melbourne, Coachmen Leprechaun/Freelander, Forest River Sunseeker/Forester.\n" +
    "- Travel Trailer: towable, no motor, bumper-pull hitch. Examples: Airstream Bambi/Flying Cloud, Jayco Jay Flight, Grand Design Imagine, R-Pod, Happier Camper, Taxa.\n" +
    "- Fifth Wheel: towable with a raised kingpin/gooseneck that sits in a pickup bed.\n" +
    "- Toy Hauler: trailer or motorhome with a rear ramp door garage.\n" +
    "- Pop Up: folding tent trailer.\n" +
    "- Truck Camper: a slide-in camper unit that sits INSIDE a pickup truck bed; you can see the pickup's cab in front of and below the camper. Examples: Lance, Northern Lite, Four Wheel Campers, Palomino Backpack.\n" +
    "- Not an RV: a bare pickup truck, SUV, car, sedan, van with no camper interior, or any tow vehicle by itself. If the photo just shows a pickup truck with no camper mounted, you MUST return 'Not an RV'. Do NOT label pickup trucks as Class C.\n" +
    "- Other: only if nothing above fits.\n\n" +
    "Brand-name cheat sheet (use these as authoritative — any listing whose title contains these words is that class regardless of model code):\n" +
    "Class B: Travato, Solis, Revel, Ekko, Boldt, Airstream Interstate, Galleria, Beyond, Storyteller, Sequence, Tellaro, Rize, Scope, Sanctuary.\n" +
    "Class C: Four Winds, Chateau, Freedom Elite, Quantum, Axis, Vegas, Minnie Winnie, View, Navion, Spirit, Outlook, Porto, Redhawk, Greyhawk, Melbourne, Seneca, Leprechaun, Freelander, Prism, Sunseeker, Forester, Isata.\n" +
    "Class A: Tiffin, Allegro, Phaeton, Newmar, Dutch Star, Mountain Aire, Ventana, Bay Star, Bounder, Pace Arrow, Hurricane, Palazzo, Georgetown, Discovery, Vista, Adventurer, Journey, Tour, Forza.\n\n" +
    "For rv_make, prefer the RV series/brand name (e.g. 'Four Winds', 'Travato') over the chassis manufacturer (e.g. 'Thor', 'Mercedes'). If the title is 'Thor Four Winds 26B', rv_make = 'Four Winds', rv_model = '26B'.\n\n" +
    "Common mistakes to AVOID:\n" +
    "1. NEVER let a trailing letter in a model code (22B, 26B, 30A) drive the class. The letter is a floorplan designator.\n" +
    "2. A 'Four Winds' is ALWAYS Class C — it has a cab-over bed. Never Class B.\n" +
    "3. Do NOT put Class C motorhomes (with an over-cab bed) into Class B. Class B NEVER has an over-cab bump.\n" +
    "4. Do NOT put a pickup truck into Class C. A Class C always has a large motorhome body behind the cab; a bare pickup truck has just a cargo bed.\n" +
    "5. A Sprinter/Transit/Promaster is Class B ONLY if it has the van's original roofline. If it has a boxy motorhome body bolted on with a cab-over, it's Class C.\n" +
    "6. 'Lance', 'Northern Lite', 'Four Wheel Camper' is a Truck Camper, not Class C.";

  const scrapeOne = async ({ platform, url }: ScrapeTarget): Promise<{ inserted: number; snapshotsInserted: number; skipped: number; errors: string[] }> => {
    const label = `${platform} ${new URL(url).searchParams.get("filter[type]") ?? new URL(url).searchParams.get("type") ?? "all"}`;
    const localErrors: string[] = [];
    let localInserted = 0;
    let localSnapshotsInserted = 0;
    let localSkipped = 0;

    const allRows: ReturnType<typeof buildRows>[number][] = [];
    const maxPages = MAX_PAGES[platform] ?? 3;

    function buildRows(listings: z.infer<typeof ListingExtractSchema>["listings"]) {
      return listings
        .filter((l) => {
          if (l.nightly_rate <= 0) return false;
          try {
            const host = new URL(l.listing_url).hostname.replace(/^www\./, "");
            return host === VALID_DOMAINS[platform];
          } catch { return false; }
        })
        .map((l) => {
          const now = new Date().toISOString();
          return {
            platform,
            market,
            rv_class: finalClass(l.rv_class as RvClass | undefined, l.rv_title, l.rv_make, l.rv_model, l.listing_url),
            listing_url: l.listing_url,
            host_name: l.host_name ?? null,
            rv_year: l.rv_year ?? null,
            rv_make: l.rv_make ?? null,
            rv_model: l.rv_model ?? null,
            nightly_rate: l.nightly_rate,
            weekly_rate: l.weekly_rate ?? null,
            review_count: l.review_count ?? null,
            avg_rating: l.avg_rating ?? null,
            amenities: l.amenities ?? [],
            scraped_at: now,
            last_seen_at: now,
          };
        })
        .filter((row) => {
          if (row.rv_class === "Not an RV") { localSkipped++; return false; }
          return true;
        });
    }

    // JSON extraction mode runs an LLM over each scraped page; that step dominates
    // latency and routinely takes 60–90s, with busy class pages (e.g. Outdoorsy
    // Class C) regularly brushing past 120s. A too-tight client timeout throws
    // away successful Firecrawl responses (and their credits) for no reason.
    // 180s gives the LLM pass room to complete while still leaving headroom
    // inside the 300s function cap for single-batch crons (outdoorsy-{1,2}).
    const CALL_TIMEOUT_MS = 180_000;
    function withTimeout<T>(promise: Promise<T>): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error(`firecrawl call timed out after ${CALL_TIMEOUT_MS / 1000}s`)),
            CALL_TIMEOUT_MS
          )
        ),
      ]);
    }

    try {
      for (let page = 0; page < maxPages; page++) {
        const pageUrl = buildPageUrl(url, platform, page);
        const result = await withTimeout(firecrawl.scrape(pageUrl, {
          formats: ["markdown", { type: "json", schema: ListingExtractSchema, prompt: EXTRACTION_PROMPT }],
          waitFor: 1500,
          ...(platform === "outdoorsy" ? { proxy: "stealth" } : {}),
        } as Parameters<typeof firecrawl.scrape>[1]));

        const raw = result as Record<string, unknown>;
        const jsonData = raw.json as z.infer<typeof ListingExtractSchema> | undefined;

        if (!jsonData?.listings?.length) {
          if (page === 0) {
            const statusCode = (raw.metadata as Record<string, unknown>)?.statusCode as number | undefined;
            const md = (raw.markdown as string | undefined)?.slice(0, 400) ?? "(no markdown)";
            localErrors.push(`${label}: no listings extracted (status ${statusCode ?? "?"}). Preview: ${md}`);
          }
          break; // no results on this page — stop paginating
        }

        const pageRows = buildRows(jsonData.listings);
        allRows.push(...pageRows);

        // Stop early if we got fewer results than a full page (end of listings)
        if (jsonData.listings.length < MIN_PAGE_RESULTS) break;
      }

      if (allRows.length > 0) {
        // Deduplicate across all pages before upserting
        const seen = new Set<string>();
        const dedupedRows = allRows.filter(r => {
          if (seen.has(r.listing_url)) return false;
          seen.add(r.listing_url);
          return true;
        });

        const { data: upserted, error } = await supabase
          .from("listings")
          .upsert(dedupedRows, { onConflict: "listing_url", ignoreDuplicates: false })
          .select("id, nightly_rate, weekly_rate, review_count, avg_rating");

        if (error) {
          localErrors.push(`${label} upsert: ${error.message}`);
        } else {
          localInserted = dedupedRows.length;

          // Append a time-series snapshot for every row we just upserted.
          // Append-only — time depth is the moat and cannot be backfilled.
          if (upserted && upserted.length > 0) {
            // Stamp the base target URL as source_url so Phase 2 can measure
            // variant-rotation lift: "distinct listings surfaced by this URL
            // on day N". The base URL encodes platform + class + (future)
            // sort/price_band params, so it IS the variant identity.
            const snapshots = upserted.map((r) => ({
              listing_id: r.id as string,
              nightly_rate: r.nightly_rate as number,
              weekly_rate: (r.weekly_rate ?? null) as number | null,
              review_count: (r.review_count ?? null) as number | null,
              avg_rating: (r.avg_rating ?? null) as number | null,
              source_url: url,
            }));
            const { error: snapErr } = await supabase
              .from("listing_snapshots")
              .insert(snapshots);
            if (snapErr) {
              localErrors.push(`${label} snapshot: ${snapErr.message}`);
            } else {
              localSnapshotsInserted = snapshots.length;
            }
          }
        }
      }
    } catch (err) {
      localErrors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      inserted: localInserted,
      snapshotsInserted: localSnapshotsInserted,
      skipped: localSkipped,
      errors: localErrors,
    };
  };

  // Run in batches of 2 — fits Firecrawl concurrency and keeps each batch ~12s
  const BATCH_SIZE = 2;
  const allResults: PromiseSettledResult<{ inserted: number; snapshotsInserted: number; skipped: number; errors: string[] }>[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(scrapeOne));
    allResults.push(...batchResults);
  }
  const results = allResults;

  for (const r of results) {
    if (r.status === "fulfilled") {
      inserted += r.value.inserted;
      snapshotsInserted += r.value.snapshotsInserted;
      skipped += r.value.skipped;
      errors.push(...r.value.errors);
    } else {
      errors.push(`target failed: ${r.reason}`);
    }
  }

  // Merge direct-API results for the whole-market run case.
  if (outdoorsyApiPromise) {
    try {
      const apiResult = await outdoorsyApiPromise;
      inserted += apiResult.inserted;
      snapshotsInserted += apiResult.snapshotsInserted;
      skipped += apiResult.skipped;
      errors.push(...apiResult.errors);
    } catch (err) {
      errors.push(`outdoorsy api: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (rvshareApiPromise) {
    try {
      const apiResult = await rvshareApiPromise;
      inserted += apiResult.inserted;
      snapshotsInserted += apiResult.snapshotsInserted;
      skipped += apiResult.skipped;
      errors.push(...apiResult.errors);
    } catch (err) {
      errors.push(`rvshare api: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { inserted, snapshotsInserted, skipped, errors };
}

// ─── Cron run log ─────────────────────────────────────────────────────────────
// Writes one row per /api/scrape invocation to public.cron_runs so we can see
// at a glance what ran, when, and what it wrote. Must never throw — a log
// failure must not promote a successful scrape into a 500.

type CronRunLog = {
  startedAt: Date;
  finishedAt: Date;
  market: string;
  platform: string | null;
  status: "success" | "partial" | "failure";
  listingsUpserted: number;
  snapshotsInserted: number;
  skippedNotRv: number;
  errors: string[];
  errorMessage: string | null;
};

async function logCronRun(entry: CronRunLog): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("cron_runs").insert({
      started_at: entry.startedAt.toISOString(),
      finished_at: entry.finishedAt.toISOString(),
      duration_ms: entry.finishedAt.getTime() - entry.startedAt.getTime(),
      market: entry.market,
      platform: entry.platform,
      status: entry.status,
      listings_upserted: entry.listingsUpserted,
      snapshots_inserted: entry.snapshotsInserted,
      skipped_not_rv: entry.skippedNotRv,
      error_count: entry.errors.length,
      errors: entry.errors.length ? entry.errors : null,
      error_message: entry.errorMessage,
    });
    if (error) console.error("cron_runs insert failed:", error.message);
  } catch (err) {
    console.error("cron_runs insert threw:", err instanceof Error ? err.message : String(err));
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const market = body.market ?? "san-diego-ca";
  const platformFilter = body.platform as "outdoorsy" | "rvshare" | undefined;

  // Firecrawl is only needed when at least one platform is on `*_SCRAPER=firecrawl`.
  // Under the post-pivot default (both modes=api) we never instantiate the client,
  // so the missing-key 500 that used to guard every invocation is now gated on
  // whether the current path actually needs Firecrawl.
  const outdoorsyMode = (process.env.OUTDOORSY_SCRAPER ?? "api").toLowerCase() === "firecrawl" ? "firecrawl" : "api";
  const rvshareMode = (process.env.RVSHARE_SCRAPER ?? "api").toLowerCase() === "firecrawl" ? "firecrawl" : "api";
  const needsFirecrawl = outdoorsyMode === "firecrawl" || rvshareMode === "firecrawl";
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (needsFirecrawl && !apiKey) {
    return NextResponse.json({ error: "FIRECRAWL_API_KEY not set (required when OUTDOORSY_SCRAPER or RVSHARE_SCRAPER is 'firecrawl')" }, { status: 500 });
  }

  // Stub client when we don't actually need Firecrawl — the scrapeMarket code
  // path doesn't touch it in all-API mode, but the type signature still wants
  // a FirecrawlApp. Using a bogus key is safe because the client lazily
  // authenticates on first request.
  const firecrawl = new FirecrawlApp({ apiKey: apiKey ?? "unused" });
  const startedAt = new Date();

  try {
    const { inserted, snapshotsInserted, skipped, errors } = await scrapeMarket(firecrawl, market, platformFilter);

    // success = scrapeMarket returned cleanly AND every target succeeded.
    // partial = some targets wrote rows but others errored.
    // failure = no rows written AND at least one error (e.g. every target timed out).
    const status: CronRunLog["status"] =
      errors.length === 0 ? "success" : inserted > 0 ? "partial" : "failure";

    await logCronRun({
      startedAt,
      finishedAt: new Date(),
      market,
      platform: platformFilter ?? null,
      status,
      listingsUpserted: inserted,
      snapshotsInserted,
      skippedNotRv: skipped,
      errors,
      errorMessage: null,
    });

    return NextResponse.json({
      success: true,
      market,
      inserted,
      snapshotsInserted,
      skipped,
      errors: errors.length ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logCronRun({
      startedAt,
      finishedAt: new Date(),
      market,
      platform: platformFilter ?? null,
      status: "failure",
      listingsUpserted: 0,
      snapshotsInserted: 0,
      skippedNotRv: 0,
      errors: [],
      errorMessage: message,
    });
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Vercel Cron calls GET — pass platform from query param if present
  const platform = new URL(req.url).searchParams.get("platform") ?? undefined;
  const body = JSON.stringify({ market: "san-diego-ca", ...(platform ? { platform } : {}) });
  return POST(new Request(req.url, { method: "POST", headers: req.headers, body }) as NextRequest);
}
