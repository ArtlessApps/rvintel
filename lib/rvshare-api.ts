// Direct client for RVshare's server-side-rendered search endpoint.
//
// Endpoint: https://rvshare.com/rv-rental.json
// Format:   Rails JSON respond_to — { data: { results, pagination, destination,
//           nightlyRateHistogram, lengthHistogram, ... } }
// Auth:     none. No Cloudflare bot defense on rvshare.com (unlike
//           www.outdoorsy.com). Direct `fetch` with `Accept: application/json`
//           works anonymously.
//
// Discovery on 2026-04-22 (see PRD §11) replaced the Firecrawl+LLM ingestion
// path for RVshare. A single call returns 20 fully structured listings in a
// standard JSON:API envelope; pagination via `&page=N` works cleanly with no
// rate-limit interference observed through 65 pages.
//
// IMPORTANT — the `type=` URL parameter on rvshare.com is COSMETIC. The
// backend ignores it (verified by inspecting result IDs across type=class-a,
// type=travel-trailer, type=truck-camper — identical 20 listings returned
// each time). Our pre-pivot Firecrawl config hit 8 per-type URLs per market
// daily and the LLM was silently client-side classifying the same shared
// universe 8 times over. This module makes one location-scoped call per page
// and classifies each listing from `attributes.type` string.
//
// This module is pure — no DB access, no Supabase. The scrape route consumes
// it and handles upsert / snapshot / cron_runs.
//
// Fallback: if rvshare.com/rv-rental.json is ever locked down, the Firecrawl
// path in route.ts can be re-enabled via RVSHARE_SCRAPER=firecrawl without a
// deploy.

// ── Types ─────────────────────────────────────────────────────────────────────

// Observed `attributes.type` values on rvshare.com/rv-rental.json (2026-04-22
// San Diego inventory, full 65-page sweep). Order matches frequency in the
// SD universe. Unknown variants fall through to `Other` at normalize-time
// rather than throwing.
const RVSHARE_TYPE_TO_RV_CLASS_TABLE: ReadonlyArray<[string, string]> = [
  ["Class A Motor Home", "Class A"],
  ["Class B Camping Van", "Class B"],
  ["Class B Motor Home", "Class B"],
  ["Class C Motor Home", "Class C"],
  ["Travel Trailer", "Travel Trailer"],
  ["Fifth Wheel", "Fifth Wheel"],
  ["Fifth Wheel Trailer", "Fifth Wheel"],
  ["Toy Hauler", "Toy Hauler"],
  ["Pop Up Camper", "Pop Up"],
  ["Pop-Up Camper", "Pop Up"],
  ["Pop Up Trailer", "Pop Up"],
  ["Truck Camper", "Truck Camper"],
];

const RVSHARE_TYPE_LOOKUP: Record<string, string> = Object.fromEntries(
  RVSHARE_TYPE_TO_RV_CLASS_TABLE.map(([k, v]) => [k.toLowerCase(), v]),
);

export function rvshareTypeToRvClass(raw: string | null | undefined): string {
  if (!raw) return "Other";
  return RVSHARE_TYPE_LOOKUP[raw.toLowerCase().trim()] ?? "Other";
}

export interface RvshareListing {
  id: string;
  listing_url: string; // canonical rvshare.com/rvs/details/{id}

  // Classification
  display_type: string | null; // "Class C Motor Home" etc., verbatim from API
  rv_class: string; // our enum ("Class A", "Travel Trailer", …)

  // Vehicle description
  headline: string | null;
  make: string | null;
  model: string | null;
  make_model: string | null; // e.g. "Winnebago Minnie Winnie 31G"
  year: number | null;

  // Pricing (dollars; RVshare returns plain integers)
  nightly_rate: number | null;
  weekly_discount_percent: number | null;
  monthly_discount_percent: number | null;

  // Social proof (rvshare reviews.score is 0-100 — we convert to 0-5 stars)
  avg_rating: number | null;
  review_count: number | null;

  // Capacity / booking policy
  sleeps: number | null;
  length_ft: number | null; // API returns string like "32.0"
  is_instant_book: boolean | null;
  delivery: boolean | null;
  insurance_status: string | null;

  // Technical specs
  electric_service: number | null;
  fresh_water_tank: number | null;
  generator_usage_included: number | null;
  nightly_mileage_included: number | null;

  // Location
  location_name: string | null;
  location_state: string | null;
  location_lat: number | null;
  location_lng: number | null;
  distance_from_search_miles: number | null;

  // Owner
  owner_id: number | null;
  premier_owner: boolean | null;

  // Badges
  guest_favorite: boolean | null;
  new_listing_without_reviews: boolean | null;

  // Media
  primary_image_url: string | null;

  // Full raw attributes for future enrichment without re-fetching
  raw: Record<string, unknown>;
}

export interface RvshareMeta {
  totalResults: number | null;
  totalPages: number | null;
  currentPage: number | null;

  // Destination echo — RVshare geocodes the free-text `location` param server-
  // side and returns the canonical result. Useful for verifying we hit the
  // intended market.
  destination_city: string | null;
  destination_state: string | null;
  destination_country: string | null;
  destination_lat: number | null;
  destination_lng: number | null;

  // Market-wide distributions (Elasticsearch histogram buckets). Zero extra
  // cost to capture — reserved for the future `search_snapshots` table.
  nightly_rate_histogram: Array<{ key: number; doc_count: number }> | null;
  length_histogram: Array<{ key: number; doc_count: number }> | null;
  generator_histogram: Array<{ key: number; doc_count: number }> | null;
  fresh_water_tank_histogram: Array<{ key: number; doc_count: number }> | null;
  nightly_mileage_histogram: Array<{ key: number; doc_count: number }> | null;
}

export interface FetchMarketOptions {
  location: string; // free-text address, e.g. "san diego ca" or "San Diego, CA"
  maxPages?: number;
  delayMs?: number;
  fetchTimeoutMs?: number;
  signal?: AbortSignal;
  onPage?: (pageIndex: number, meta: RvshareMeta, pageListingCount: number) => void;
}

export interface FetchMarketResult {
  listings: RvshareListing[];
  meta: RvshareMeta;
  pagesFetched: number;
  sourceUrl: string; // stable UI-shaped URL for snapshot attribution
  backendBaseUrl: string;
}

// ── URL builders ──────────────────────────────────────────────────────────────

// UI-shaped URL we stamp on listing_snapshots.source_url. Kept parameter-
// compatible with the pre-pivot Firecrawl targets (which used `type=class-a`
// etc.) so historical snapshot joins still work — even though we now know the
// backend ignored `type`, the old rows attributed listings to whichever URL
// surfaced them first via the LLM's client-side classification. The new
// unified URL uses no `type=` param since the backend was always type-blind.
export function rvshareUiUrl(location: string): string {
  const u = new URL("https://rvshare.com/rv-rental");
  u.searchParams.set("location", location);
  return u.toString();
}

function backendUrl(location: string, page: number): string {
  const u = new URL("https://rvshare.com/rv-rental.json");
  u.searchParams.set("location", location);
  if (page > 1) u.searchParams.set("page", String(page));
  return u.toString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  return null;
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

// ── Normalizer ────────────────────────────────────────────────────────────────

interface RawRvshareResult {
  id: string;
  type?: string; // JSON:API envelope — always "rvs" here
  attributes?: Record<string, unknown>;
}

function normalizeRental(raw: RawRvshareResult): RvshareListing {
  const a = raw.attributes ?? {};
  const loc = (a.location ?? {}) as Record<string, unknown>;
  const reviews = (a.reviews ?? {}) as Record<string, unknown>;
  const owner = (a.owner ?? {}) as Record<string, unknown>;
  const thumbnail = (a.thumbnail ?? {}) as Record<string, unknown>;

  // RVshare reviews.score is on a 0-100 scale (e.g. 92.727); our schema uses
  // 0-5 stars. Max is reported on reviews.max_score but is consistently 100.
  const rawScore = asNumber(reviews.score);
  const maxScore = asNumber(reviews.max_score) ?? 100;
  const avg_rating = rawScore !== null && maxScore > 0 ? (rawScore / maxScore) * 5 : null;

  const displayType = asString(a.type);

  return {
    id: raw.id,
    listing_url: `https://rvshare.com/rvs/details/${raw.id}`,
    display_type: displayType,
    rv_class: rvshareTypeToRvClass(displayType),
    headline: asString(a.headline),
    make: asString(a.make),
    model: asString(a.model),
    make_model: asString(a.rv_make_model),
    year: asNumber(a.rv_year),
    nightly_rate: asNumber(a.rate),
    weekly_discount_percent: asNumber(a.weekly_discount_percent),
    monthly_discount_percent: asNumber(a.monthly_discount_percent),
    avg_rating: avg_rating !== null ? Math.round(avg_rating * 100) / 100 : null,
    review_count: asNumber(reviews.count),
    sleeps: asNumber(a.how_many_it_sleeps),
    length_ft: asNumber(a.length),
    is_instant_book: asBoolean(a.is_instant_book),
    delivery: asBoolean(a.delivery),
    insurance_status: asString(a.insurance_status),
    electric_service: asNumber(a.electric_service),
    fresh_water_tank: asNumber(a.fresh_water_tank),
    generator_usage_included: asNumber(a.generator_usage_included),
    nightly_mileage_included: asNumber(a.nightly_mileage_included),
    location_name: asString(loc.name),
    location_state: asString(loc.state),
    location_lat: asNumber(loc.lat),
    location_lng: asNumber(loc.lng),
    distance_from_search_miles: asNumber(loc.distance),
    owner_id: asNumber(owner.id),
    premier_owner: asBoolean(owner.premier_owner),
    guest_favorite: asBoolean(a.guest_favorite),
    new_listing_without_reviews: asBoolean(a.new_listing_without_reviews),
    primary_image_url: asString(thumbnail.url) ?? asString(thumbnail.filename),
    raw: a,
  };
}

interface RawHistogramBucket {
  key: number;
  doc_count: number;
}

function normalizeHistogram(raw: unknown): RvshareMeta["nightly_rate_histogram"] {
  if (!raw || typeof raw !== "object") return null;
  const buckets = (raw as { buckets?: unknown }).buckets;
  if (!Array.isArray(buckets)) return null;
  const result: RawHistogramBucket[] = [];
  for (const b of buckets) {
    if (!b || typeof b !== "object") continue;
    const key = asNumber((b as Record<string, unknown>).key);
    const doc_count = asNumber((b as Record<string, unknown>).doc_count);
    if (key !== null && doc_count !== null) result.push({ key, doc_count });
  }
  return result.length > 0 ? result : null;
}

function normalizeMeta(
  pagination: Record<string, unknown> | undefined,
  destination: Record<string, unknown> | undefined,
  data: Record<string, unknown>,
): RvshareMeta {
  const p = pagination ?? {};
  const d = destination ?? {};
  return {
    totalResults: asNumber(p.totalResults),
    totalPages: asNumber(p.totalPages),
    currentPage: asNumber(p.currentPage),
    destination_city: asString(d.city),
    destination_state: asString(d.state),
    destination_country: asString(d.country),
    destination_lat: asNumber(d.lat),
    destination_lng: asNumber(d.lng),
    nightly_rate_histogram: normalizeHistogram(data.nightlyRateHistogram),
    length_histogram: normalizeHistogram(data.lengthHistogram),
    generator_histogram: normalizeHistogram(data.generatorHistogram),
    fresh_water_tank_histogram: normalizeHistogram(data.freshWaterTankHistogram),
    nightly_mileage_histogram: normalizeHistogram(data.nightlyMileageHistogram),
  };
}

// ── Single-page fetch ─────────────────────────────────────────────────────────

interface RawSearchPayload {
  data?: {
    results?: RawRvshareResult[];
    pagination?: Record<string, unknown>;
    destination?: Record<string, unknown>;
    [k: string]: unknown;
  };
}

async function fetchOnePage(
  url: string,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<{ results: RawRvshareResult[]; meta: RvshareMeta }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://rvshare.com/",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`rvshare api ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as RawSearchPayload;
    const data = json.data ?? {};
    return {
      results: Array.isArray(data.results) ? data.results : [],
      meta: normalizeMeta(data.pagination, data.destination, data),
    };
  } finally {
    clearTimeout(timeoutId);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  }
}

// ── Paginated fetch ───────────────────────────────────────────────────────────

// RVshare returns 20 listings per page and reports `pagination.totalPages`
// honestly on every response. We trust `totalPages` as the stop condition;
// `maxPages` is a safety cap for the pathological case of an uncapped backend
// change (e.g. totalPages suddenly = 9999).
export async function fetchRvshareMarket(opts: FetchMarketOptions): Promise<FetchMarketResult> {
  const {
    location,
    maxPages = 80,
    delayMs = 200,
    fetchTimeoutMs = 15_000,
    signal,
    onPage,
  } = opts;

  const sourceUrl = rvshareUiUrl(location);
  const firstBackendUrl = backendUrl(location, 1);

  const listings: RvshareListing[] = [];
  const seenIds = new Set<string>();
  let latestMeta: RvshareMeta = {
    totalResults: null,
    totalPages: null,
    currentPage: null,
    destination_city: null,
    destination_state: null,
    destination_country: null,
    destination_lat: null,
    destination_lng: null,
    nightly_rate_histogram: null,
    length_histogram: null,
    generator_histogram: null,
    fresh_water_tank_histogram: null,
    nightly_mileage_histogram: null,
  };
  let pagesFetched = 0;

  // RVshare pages are 1-indexed (`page=1` is the default, `page=2` onward for
  // subsequent). Our outer loop is also 1-indexed to match.
  for (let page = 1; page <= maxPages; page++) {
    const url = backendUrl(location, page);
    const { results, meta } = await fetchOnePage(url, fetchTimeoutMs, signal);
    pagesFetched++;
    latestMeta = meta;

    for (const raw of results) {
      if (seenIds.has(raw.id)) continue;
      seenIds.add(raw.id);
      listings.push(normalizeRental(raw));
    }

    onPage?.(page, meta, results.length);

    // End conditions:
    //  1. Pagination metadata says we've hit the last page.
    //  2. An empty page (defensive — shouldn't happen under normal responses).
    //  3. meta.totalResults reported and we've collected them all.
    if (meta.totalPages !== null && page >= meta.totalPages) break;
    if (results.length === 0) break;
    if (meta.totalResults !== null && listings.length >= meta.totalResults) break;

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return {
    listings,
    meta: latestMeta,
    pagesFetched,
    sourceUrl,
    backendBaseUrl: firstBackendUrl,
  };
}
