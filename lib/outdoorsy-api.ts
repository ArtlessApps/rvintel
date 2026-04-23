// Direct client for Outdoorsy's internal search API.
//
// Endpoint: https://search.outdoorsy.com/rentals
// Format:   JSON:API { data, included, meta }
// Auth:     none (public, undocumented). `Origin: https://www.outdoorsy.com` is
//           sufficient to avoid 4xx on some edge nodes.
//
// Discovery on 2026-04-22 (see PRD §11) replaced the Firecrawl+LLM ingestion
// path for Outdoorsy. One call returns 24 fully structured listings with 140
// attributes each; pagination is standard `page[offset]` / `page[limit]` and
// works without bot-defense interference on this subdomain (unlike the
// `www.outdoorsy.com` search UI).
//
// This module is pure — no DB access, no Supabase. The scrape route consumes
// it and handles upsert / snapshot / cron_runs.
//
// Fallback: if this endpoint is ever locked down, the Firecrawl+LLM path in
// route.ts can be re-enabled via OUTDOORSY_SCRAPER=firecrawl without a deploy.

// ── Types ─────────────────────────────────────────────────────────────────────

// Backend filter enum (NOT the UI filter enum; see PRD §11 2026-04-22 for the
// `tt` → `trailer` bug that cost us months of travel-trailer coverage).
export type OutdoorsyClassCode = "a" | "b" | "c" | "trailer" | "fifth-wheel";

export const OUTDOORSY_CLASS_CODES: OutdoorsyClassCode[] = [
  "a",
  "b",
  "c",
  "trailer",
  "fifth-wheel",
];

// Canonical mapping from backend code → our rv_class enum. The display_vehicle_type
// string in the response (e.g. "Class B", "Travel trailer") is the authoritative
// signal at row-level; this table is only used when display_vehicle_type is absent.
export const OUTDOORSY_CODE_TO_RV_CLASS: Record<OutdoorsyClassCode, string> = {
  a: "Class A",
  b: "Class B",
  c: "Class C",
  trailer: "Travel Trailer",
  "fifth-wheel": "Fifth Wheel",
};

export interface OutdoorsyListing {
  id: string;
  listing_url: string; // absolute www.outdoorsy.com URL derived from `slug`
  slug: string | null;

  // Vehicle description
  display_vehicle_type: string | null; // "Class B", "Travel trailer", "Class C", etc.
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;

  // Pricing (all in cents as returned by the API)
  price_per_day_cents: number | null;
  price_per_week_cents: number | null;
  price_per_month_cents: number | null;

  // Social proof
  avg_rating: number | null;
  review_count: number | null;

  // Capacity / booking policy
  sleeps: number | null;
  sleeps_adults: number | null;
  sleeps_kids: number | null;
  instant_book: boolean | null;
  minimum_days: number | null;
  cancel_policy: string | null;

  // Delivery
  delivery: boolean | null;
  delivery_radius_miles: number | null;

  // Physical dimensions
  vehicle_length: number | null;
  vehicle_height: number | null;
  vehicle_dry_weight: number | null;
  vehicle_gvwr: number | null;

  // Media
  primary_image_url: string | null;

  // Location
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  location_lat: number | null;
  location_lng: number | null;

  // Lifecycle
  published: boolean | null;
  first_published: string | null;
  last_published: string | null;
  created_at: string | null;
  updated_at: string | null;

  // Ranking signals
  rental_score: number | null;
  sort_score: number | null;

  // Full raw attributes for future extraction without re-fetching
  raw: Record<string, unknown>;
}

export interface OutdoorsyMeta {
  total: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  price_min: number | null;
  price_max: number | null;
  price_average: number | null;
  price_median: number | null;
  price_histogram: number[] | null;
  total_unavailable: number | null;
}

export interface FetchClassOptions {
  address: string;
  classCode: OutdoorsyClassCode;
  pageSize?: number;
  maxPages?: number;
  delayMs?: number;
  fetchTimeoutMs?: number;
  signal?: AbortSignal;
  onPage?: (pageIndex: number, meta: OutdoorsyMeta, pageListingCount: number) => void;
}

export interface FetchClassResult {
  listings: OutdoorsyListing[];
  meta: OutdoorsyMeta;
  pagesFetched: number;
  sourceUrl: string; // stable UI-shaped URL for snapshot attribution
  backendBaseUrl: string; // the actual search.outdoorsy.com URL (for debugging)
}

// ── URL builders ──────────────────────────────────────────────────────────────

// Shape of the stable "variant identity" URL we store on listing_snapshots.source_url.
// We use the www.outdoorsy.com UI URL so historical snapshots stay join-compatible
// across the 2026-04-22 pivot (except for travel trailer, which legitimately changed
// from `tt` to `trailer` — the old `tt` source_url values were already masking a bug).
export function outdoorsyUiUrl(address: string, classCode: OutdoorsyClassCode): string {
  const u = new URL("https://www.outdoorsy.com/rv-search");
  u.searchParams.set("address", address);
  u.searchParams.set("manual_address_input", "false");
  u.searchParams.set("filter[renter_age]", "25");
  u.searchParams.set("skip_defaults", "true");
  u.searchParams.set("filter[type]", classCode);
  return u.toString();
}

function backendUrl(address: string, classCode: OutdoorsyClassCode, pageLimit: number, pageOffset: number): string {
  const u = new URL("https://search.outdoorsy.com/rentals");
  u.searchParams.set("address", address);
  u.searchParams.set("filter[type]", classCode);
  u.searchParams.set("page[limit]", String(pageLimit));
  u.searchParams.set("page[offset]", String(pageOffset));
  return u.toString();
}

// ── Classification helper ─────────────────────────────────────────────────────

const DISPLAY_VEHICLE_TYPE_TO_RV_CLASS: Record<string, string> = {
  "class a": "Class A",
  "class b": "Class B",
  "class c": "Class C",
  "travel trailer": "Travel Trailer",
  "fifth wheel": "Fifth Wheel",
  "fifth-wheel": "Fifth Wheel",
  "toy hauler": "Toy Hauler",
  "pop up": "Pop Up",
  "pop-up": "Pop Up",
  "truck camper": "Truck Camper",
};

export function displayVehicleTypeToRvClass(dvt: string | null | undefined): string | null {
  if (!dvt) return null;
  const key = dvt.toLowerCase().trim();
  return DISPLAY_VEHICLE_TYPE_TO_RV_CLASS[key] ?? null;
}

// ── Normalizer ────────────────────────────────────────────────────────────────

interface RawRental {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

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

// Outdoorsy occasionally returns sentinel timestamps like
// "0000-12-31T16:07:02-07:52" for un-set first_published / last_published
// fields. Postgres `timestamptz` rejects year 0000 as "out of range", which
// used to fail the entire 50-row upsert chunk. Treat anything older than
// 1970 (and anything that fails Date parsing) as null.
function asTimestamp(v: unknown): string | null {
  const s = asString(v);
  if (s === null) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  if (ms < 0) return null;
  return s;
}

function normalizeRental(raw: RawRental): OutdoorsyListing {
  const a = raw.attributes ?? {};
  const loc = (a.location ?? {}) as Record<string, unknown>;
  const slug = asString(a.slug);
  // slug example: "/rv-rental/chula-vista_ca/2015_coach-house_mercedes-sprinter-class-c_434086-listing"
  const listing_url = slug
    ? `https://www.outdoorsy.com${slug}`
    : `https://www.outdoorsy.com/rv-rental/listing/${raw.id}`;

  // avg_rating lives in nested average_reviews.group or similar; pick first present.
  // response shape: average_reviews.rental[0].score (rental-level average, 0-5)
  let avgRating: number | null = null;
  let reviewCount: number | null = null;
  const reviewsNum = asNumber(a.reviews_num);
  if (reviewsNum !== null) reviewCount = reviewsNum;
  const avgReviews = a.average_reviews as Record<string, unknown> | undefined;
  if (avgReviews?.rental && Array.isArray(avgReviews.rental) && avgReviews.rental.length > 0) {
    const firstRental = avgReviews.rental[0] as Record<string, unknown>;
    avgRating = asNumber(firstRental.score);
  }

  return {
    id: raw.id,
    listing_url,
    slug,
    display_vehicle_type: asString(a.display_vehicle_type),
    vehicle_year: asNumber(a.vehicle_year),
    vehicle_make: asString(a.vehicle_make),
    vehicle_model: asString(a.vehicle_model),
    price_per_day_cents: asNumber(a.price_per_day),
    price_per_week_cents: asNumber(a.price_per_week),
    price_per_month_cents: asNumber(a.price_per_month),
    avg_rating: avgRating,
    review_count: reviewCount,
    sleeps: asNumber(a.sleeps),
    sleeps_adults: asNumber(a.sleeps_adults),
    sleeps_kids: asNumber(a.sleeps_kids),
    instant_book: asBoolean(a.instant_book),
    minimum_days: asNumber(a.minimum_days),
    cancel_policy: asString(a.cancel_policy),
    delivery: asBoolean(a.delivery),
    delivery_radius_miles: asNumber(a.DeliveryRadiusMiles),
    vehicle_length: asNumber(a.vehicle_length),
    vehicle_height: asNumber(a.vehicle_height),
    vehicle_dry_weight: asNumber(a.vehicle_dry_weight),
    vehicle_gvwr: asNumber(a.vehicle_gvwr),
    primary_image_url: asString(a.primary_image_url),
    location_city: asString(loc.city),
    location_state: asString(loc.state),
    location_zip: asString(loc.zip),
    location_lat: asNumber(loc.lat),
    location_lng: asNumber(loc.lng),
    published: asBoolean(a.published),
    first_published: asTimestamp(a.first_published),
    last_published: asTimestamp(a.last_published),
    created_at: asTimestamp(a.created),
    updated_at: asTimestamp(a.updated),
    rental_score: asNumber(a.rental_score),
    sort_score: asNumber(a.sort_score),
    raw: a,
  };
}

// Outdoorsy's `meta.price_*` fields are in cents (same as per-listing
// `price_per_day`). We convert to dollars here so search_snapshots and
// listings share a single currency convention (`nightly_rate` is dollars).
// `price_histogram` is an array of bucket counts, NOT prices — don't convert.
function centsToDollars(v: number | null): number | null {
  return v === null ? null : v / 100;
}

function normalizeMeta(rawMeta: Record<string, unknown> | undefined): OutdoorsyMeta {
  const m = rawMeta ?? {};
  const hist = m.price_histogram as Record<string, unknown> | undefined;
  return {
    total: asNumber(m.total),
    city: asString(m.city),
    state: asString(m.state),
    country: asString(m.country_name) ?? asString(m.country),
    lat: asNumber(m.lat),
    lng: asNumber(m.lng),
    radius: asNumber(m.radius),
    price_min: centsToDollars(asNumber(m.price_min)),
    price_max: centsToDollars(asNumber(m.price_max)),
    price_average: centsToDollars(asNumber(m.price_average)),
    price_median: centsToDollars(asNumber(m.price_median)),
    price_histogram: Array.isArray(hist?.data) ? (hist.data as number[]) : null,
    total_unavailable: asNumber(m.total_unavailable),
  };
}

// ── Single-page fetch ─────────────────────────────────────────────────────────

async function fetchOnePage(
  url: string,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<{ data: RawRental[]; meta: OutdoorsyMeta }> {
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
        Accept: "application/vnd.api+json, application/json",
        Origin: "https://www.outdoorsy.com",
        Referer: "https://www.outdoorsy.com/",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`outdoorsy api ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data?: RawRental[];
      meta?: Record<string, unknown>;
    };
    return {
      data: Array.isArray(json.data) ? json.data : [],
      meta: normalizeMeta(json.meta),
    };
  } finally {
    clearTimeout(timeoutId);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  }
}

// ── Paginated fetch ───────────────────────────────────────────────────────────

export async function fetchOutdoorsyClass(opts: FetchClassOptions): Promise<FetchClassResult> {
  const {
    address,
    classCode,
    pageSize = 24,
    maxPages = 50,
    delayMs = 250,
    fetchTimeoutMs = 15_000,
    signal,
    onPage,
  } = opts;

  const sourceUrl = outdoorsyUiUrl(address, classCode);
  const firstBackendUrl = backendUrl(address, classCode, pageSize, 0);

  const listings: OutdoorsyListing[] = [];
  const seenIds = new Set<string>();
  let latestMeta: OutdoorsyMeta = {
    total: null,
    city: null,
    state: null,
    country: null,
    lat: null,
    lng: null,
    radius: null,
    price_min: null,
    price_max: null,
    price_average: null,
    price_median: null,
    price_histogram: null,
    total_unavailable: null,
  };
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const url = backendUrl(address, classCode, pageSize, offset);
    const { data, meta } = await fetchOnePage(url, fetchTimeoutMs, signal);
    pagesFetched++;
    latestMeta = meta;

    for (const raw of data) {
      if (seenIds.has(raw.id)) continue;
      seenIds.add(raw.id);
      listings.push(normalizeRental(raw));
    }

    onPage?.(page, meta, data.length);

    // End conditions:
    //  1. Page returned fewer than a full page → we've reached the tail.
    //  2. meta.total is known and we've already collected everything.
    if (data.length < pageSize) break;
    if (meta.total !== null && listings.length >= meta.total) break;

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
