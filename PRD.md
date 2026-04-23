# RVIntel — Product Requirements Document

**Status:** Draft v1.5 · 2026-04-23
**Owner:** Nick Dame
**Stack:** Next.js 16 · Supabase · Firecrawl · Vercel Pro

---

## 1. Problem

RV rental hosts operating on Outdoorsy, RVshare, and similar platforms have no credible market-intelligence tool. They guess at nightly rates, copy competitors blindly, and cannot defend pricing decisions to partners or lenders. Existing tools (AirDNA, Mashvisor) serve short-term rental hosts but ignore the RV category entirely.

The opportunity is a **"AirDNA for RVs"** — a subscription product that gives RV hosts and fleet operators defensible answers to three questions:

1. **What is the market renting for right now?** (current pricing)
2. **How does my listing compare to similar ones?** (comp-sets)
3. **Am I being booked at a rate that matches the market?** (occupancy)

---

## 2. Goals & Non-Goals

### Goals
- Provide **current, unbiased** market pricing for every major RV rental market in the US, starting with San Diego.
- Enable **host-level comp-sets** — "show me 8 listings like mine and what they're charging."
- Expose **price trend and occupancy data** derived from time-series scraping.
- Offer a **"Benchmark My Listing" self-serve report** — host pastes their Outdoorsy/RVshare URL and gets an instant head-to-head vs. the market (class, price percentile, comp-set, occupancy gap).
- Maintain a **defensible methodology** buyers can interrogate: sample size, freshness, coverage.

### Non-Goals
- Not a booking platform. We do not transact bookings.
- Not a fleet management tool. We do not handle maintenance, calendars, or payments.
- Not real-time. Data refreshes daily; that is sufficient for pricing decisions.
- Not a consumer-facing search engine. The audience is hosts, operators, and investors.

---

## 3. Users

| Persona | Pain | Willingness to Pay |
|---|---|---|
| **Solo host** (1-3 units) | Undercharging because they have no reference | $29-49/mo |
| **Fleet operator** (10-50 units) | Needs per-market pricing across diverse inventory | $199-499/mo |
| **Investor / dealer** | Evaluating market entry, pricing floors for financing | $500-2000/mo |

MVP focuses on the solo host via a waitlist-driven freemium funnel; fleet and investor tiers come later once time-series depth is sufficient (≥90 days).

---

## 4. Core Product Principles

### 4.1 "Updated" means every data point is ≤7 days fresh
A 30-day-old price is a wrong price, not a lagging price. The dashboard must never mix stale and current prices in the same aggregate. Every chart is computed from listings where `scraped_at > now() - 7d`.

### 4.2 "Complete" means statistically unbiased, not exhaustive
A representative sample of 150 listings gives averages within ±2% of the true market. A biased sample of 350 can be wildly wrong. Our goal is unbiased sampling, not total enumeration. Users will be told plainly: *"312 Class B listings · prices captured in last 7 days."*

### 4.3 Time depth is the moat
Scraping is commodity. Time-series depth cannot be bought or backfilled. Every day we delay capture is a day of moat we never recover. **Append-only snapshots start immediately and never stop.**

### 4.4 Detail depth unlocks differentiation
**Updated 2026-04-23.** The original framing of "search-page vs. detail-page" has been overtaken by events. The Outdoorsy and RVshare search APIs return the core comp-set attributes — `length_ft`, `sleeps`, `instant_book`, `delivery`, `delivery_radius_miles`, `minimum_days`, `cancel_policy`, `location_{lat,lng}` — natively on every daily cron run. These were previously assumed to require detail-page enrichment.

What remains genuinely locked behind detail pages is the *behavioral and amenity* layer: `slides`, `fuel_type`, `delivery_per_mile_fee`, `cleaning_fee`, `solar`, `pet_policy`, `host_response_rate`, `host_response_time`. These are the features that push a comp-set from "same class, similar price" to "same class, similar price, same amenity bundle." Plus availability calendars, which are the basis for occupancy inference.

The restated principle: **passive daily crons now supply ~80% of the attribute surface needed for Phase 4 comp-sets. Phase 3 enrichment captures the remaining 20% that detail pages uniquely expose.**

### 4.5 Cross-platform de-duplication is a precision problem, not a recall problem

An RV listed on both Outdoorsy and RVshare is one RV, not two. Treating it as two corrupts every aggregate we ship: market-size counts are inflated by the cross-listing overlap, price distributions are skewed because the same vehicle contributes two data points, and a host's Phase 4 comp-set can surface their *own* listing from the other platform as a competitor. That last failure is the trust-killer — if a user spots their own listing in their comp-set, the product is broken in their head forever.

The canonical solution is a `canonical_vehicles` layer that merges confirmed cross-platform duplicates while preserving the per-platform history. The design posture: **false positives are worse than false negatives.** Missing a real match leaves it counted twice until someone fixes it — an invisible but correctable error. A false positive hides a legitimate competitor from a host's comp-set and produces wrong numbers on a dashboard the host can see. The detection pipeline (migrations 007–009) accepts lower recall in exchange for ≥99% precision on auto-linked pairs, and queues the rest for human review.

Operationally: only auto-link a pair when **year matches exactly, make+model trigram similarity ≥ 0.60, distance ≤ 0.5 mi, sleeps differ by ≤ 1, and rate differs by ≤ 30%.** Everything else sits in a MEDIUM queue awaiting a reviewer's verdict. The canonical table is re-derivable from `candidate_duplicates` + `reviewer_verdict` at any time, so tightening or loosening thresholds is a re-run, not a migration.

---

## 5. Architecture

Four-layer data model, built in order:

```
┌─────────────────────────────────────────────────────┐
│ 4. Comp-Set Engine (premium)                         │
│    kNN on attributes → query snapshots for the set   │
│    Joins on canonical_vehicle_id, not listing_url    │
│    → a host never sees their cross-listing in comps  │
├─────────────────────────────────────────────────────┤
│ 3. Aggregations (current dashboard)                  │
│    Market × class rollups; distribution charts       │
│    COUNT DISTINCT canonical vehicles, not listings   │
│    search_snapshots — market-size trend over time    │
├─────────────────────────────────────────────────────┤
│ 2. Snapshots (time-series moat)                      │
│    listing_snapshots — append-only per scrape        │
│    search_snapshots — market rollup per cron run     │
│    availability_snapshots — weekly calendars         │
├─────────────────────────────────────────────────────┤
│ 1.5 Canonical identity (cross-platform dedup)        │
│    candidate_duplicates — audit + review queue       │
│    canonical_vehicles — merged cross-platform RV     │
│    listings.canonical_vehicle_id → canonical row     │
├─────────────────────────────────────────────────────┤
│ 1. Registry                                          │
│    listings — one row per listing_url                │
│    ~80% of comp-set attrs populated at discovery     │
│    /api/enrich fills residual amenity/behavioral     │
└─────────────────────────────────────────────────────┘
```

### 5.1 Data capture strategy

Four distinct data jobs with different cadences and costs:

| Job | Cadence | Source | Cost per run | Purpose |
|---|---|---|---|---|
| **Discovery + pricing — Outdoorsy** | Daily | `search.outdoorsy.com/rentals` JSON:API | **$0** | Captures full URLs + current prices + 140 attributes per listing — including `length_ft`, `sleeps`, `sleeps_adults/kids`, `instant_book`, `minimum_days`, `cancel_policy`, `delivery`, `delivery_radius_miles`, `location_{city,state,lat,lng,zip}`, `primary_image_url`, `first_published`, `rental_score`, `sort_score`, vehicle dimensions. Writes one `search_snapshots` row per class (price stats + histogram). |
| **Discovery + pricing — RVshare** | Daily | `rvshare.com/rv-rental.json` JSON:API | **$0** | Captures full URLs + current prices + 27 attributes per listing — including `sleeps`, `length_ft`, `instant_book`, `delivery`, `insurance_status`, `electric_service`, `fresh_water_tank`, `generator_usage_included`, `nightly_mileage_included`, `location_{state,lat,lng}`, `owner_id`, `premier_owner`, `guest_favorite`, `new_listing_without_reviews`, `primary_image_url`, `weekly/monthly_discount_percent`. Writes one `search_snapshots` row (full-market grain) with 5 histograms. |
| **Enrichment** | Once per new listing | Detail pages | ~5 credits per listing | Captures the **residual detail-page-only fields** not exposed by search APIs: `slides`, `fuel_type`, `delivery_per_mile_fee`, `cleaning_fee`, `solar`, `pet_policy`, `photo_count`, `host_response_rate`, `host_response_time`. Core comp-set attributes (`length_ft`, `sleeps`, `delivery`, `location`) are already populated at discovery — enrichment adds the amenity/behavioral layer that separates "same class, similar price" comp-sets from "same class, same amenity bundle" comp-sets. |
| **Calendar** | Weekly per active listing | Detail pages | ~1 credit per listing | Powers occupancy inference via `availability_snapshots`. |

Both platforms moved to direct JSON:API on 2026-04-22 (see §11). A full SD sweep across both platforms is ~135 HTTPS requests totaling ~65s end-to-end at zero external cost. LLM extraction via Firecrawl is retained as a dormant fallback on both platforms (`OUTDOORSY_SCRAPER`, `RVSHARE_SCRAPER` env flags).

### 5.2 Diversified discovery (Phase 2) — SUPERSEDED

~~To avoid bias from platforms' relevance-sorted defaults, discovery rotates query shape across days.~~

**Superseded by the 2026-04-22 direct JSON:API pivot.** The diversification problem was a consequence of pagination depth limits (Firecrawl's per-page credit cost prevented us from paginating to full coverage) and of relevance-sort bias in the default rankings. The direct API paths paginate the full universe on every daily sweep — 100% coverage is the baseline, not a target. The bias mitigation section is retained as historical context; it is not an active engineering task.

### 5.3 Lifecycle tracking

Every listing has:
- `first_seen_at` — immutable; set on initial discovery
- `last_seen_at` — updated every time discovery surfaces the listing
- `is_active` — flipped `false` when `last_seen_at < now() - 14d` (listing removed from platform)
- `enriched_at` — set once detail-page attributes are captured; null = enrichment queue

---

## 6. Scrape budget & platform constraints

### Firecrawl (Hobby, 3000 credits/month)

| Mode | Credits per call | Typical latency |
|---|---|---|
| Plain markdown | 1 | 3-5s |
| JSON extraction | 5 | 60-90s (up to 150s on busy classes) |
| Stealth proxy | 5× multiplier | 40-60s |

JSON extraction dominated cost **and latency** pre-pivot. After the 2026-04-22 dual pivot (Outdoorsy + RVshare both onto direct JSON:APIs), Firecrawl is a dormant fallback on both platforms — the two-tier scrape architecture is moot for SD. The Firecrawl budget below applies only when `OUTDOORSY_SCRAPER` or `RVSHARE_SCRAPER` is flipped to `firecrawl`.

**Steady-state budget at daily cadence (San Diego only), post-2026-04-22 pivot:**
- RVshare: direct API calls, **0 credits/day** (~65 HTTPS requests totaling ~50s end-to-end)
- Outdoorsy: direct API calls, **0 credits/day** (~70 HTTPS requests totaling ~15s end-to-end)
- Total: **0 credits/month** (Firecrawl credits only consumed if a fallback flag is flipped)

The Hobby 3,000/month allowance is now entirely reserved for enrichment (Phase 3) and future market expansion. San Diego at daily cadence costs zero credits across both platforms — a 97% reduction from the pre-pivot 1,200/mo projection.

### Vercel (Pro, 300s function cap)

| Cron | Target count | Worst-case duration | Status |
|---|---|---|---|
| `rvshare` | 1 unified sweep | ~60s (65 pages × ~300ms) | Fits |
| `outdoorsy-1` (classes `b`, `a`) | 2 classes → ~23 API pages | ~30s | Fits |
| `outdoorsy-2` (classes `c`, `trailer`) | 2 classes → ~47 API pages | ~60s | Fits |

Three staggered crons at 6:00, 6:20, 7:00 UTC. The Outdoorsy split (2026-04-21) originally spaced Firecrawl batches ~40 min apart to dodge stealth-proxy IP reuse; after the 2026-04-22 pivot to direct JSON:API, the split is retained for durability (one failure does not tank the whole platform) rather than for bot-defense reasons. Both platform paths are now I/O-bound, not LLM-bound, so `CALL_TIMEOUT_MS` is irrelevant — a per-request 15s fetch timeout is all that's needed. The RVshare cron was collapsed from 2 cron jobs × 4 per-type URLs into a single unified sweep on 2026-04-22 after discovering the `type=` URL parameter was cosmetic (see §11).

---

## 7. Dashboard requirements

### 7.1 Honest aggregates

Every chart shows a freshness and coverage badge:

> **San Diego · Class B · 312 listings · 287 priced in last 7 days**
> Avg $187/night · Median $165 · P90 $285

### 7.2 Filter on active + fresh

All dashboard queries use:
```sql
WHERE market = $1 AND rv_class = $2 AND is_active = true
```
Chart aggregates further filter `scraped_at > now() - 7d`.

### 7.3 Coverage warning during bootstrap

When `freshCount / totalActive < 0.6`, show a "Calibrating — coverage building" banner instead of partial charts.

### 7.4 Market-size trend (search_snapshots)

The `search_snapshots` table accumulates one row per cron run per (platform, class) with `total_results` and price stats. This enables:
- A **"true market size" denominator** on the dashboard — "1,286 RVshare listings in SD as of today" — that comes from platform-reported totals, not from counting our DB rows (which may lag by a cron cycle).
- A **market-size trend card** once we have ≥14 days of data: "SD inventory up 4% week-over-week (1,286 → 1,337)."
- **Platform-level price distribution trend** for Outdoorsy (per-class price histograms captured daily) without re-computing from individual listing rows. Useful for the dashboard's "market median over 60 days" line chart.

### 7.5 Platform visibility score (Outdoorsy rental_score / sort_score)

Outdoorsy's `rental_score` and `sort_score` are internal ranking signals stored per listing as of migration 005 (2026-04-23). These unlock a new dashboard card: **"Platform visibility — your listing's sort_score vs. comp-set median."** A host whose sort_score is in the 20th percentile for their class is likely being buried in search results regardless of price. No other market intelligence tool surfaces this signal. Planned for the comp-set surface (Phase 4), but the data is already flowing.

---

## 8. Roadmap

### Phase 1 — Foundation (COMPLETE 2026-04-20, hardened 2026-04-21, both platforms re-platformed to direct JSON:API 2026-04-22)
- [x] `listing_snapshots` table (time-series capture)
- [x] `first_seen_at`, `last_seen_at`, `is_active`, `enriched_at` columns
- [x] Scrape route writes snapshot row per listing per run
- [x] Dashboard shows "priced in last 7d" metric + filters `is_active = true`
- [x] Staggered daily crons — `rvshare`, `outdoorsy-1`, `outdoorsy-2` (RVshare collapsed 2 → 1 on 2026-04-22 after finding `type=` was cosmetic; Outdoorsy split 2026-04-21 to mitigate bot defense, retained for durability)
- [x] Firecrawl client timeout raised to 120s (2026-04-20), then to 180s (2026-04-21) after observing Class C LLM extractions brushing 120s
- [x] Daily cron observability — `CRON_QUERIES.md` with 12 SQL queries (status, coverage, trends, triage) plus a `cron_runs` table capturing per-invocation status, duration, error arrays, and write counts
- [x] One-off Outdoorsy San Diego backfill script — `scripts/backfill_outdoorsy_sd.mjs`, standalone Node runner. **Re-written 2026-04-22** to use the direct JSON:API path instead of neighborhood-sweep markdown scraping.
- [x] **Outdoorsy internal JSON:API discovered and integrated (2026-04-22).** `search.outdoorsy.com/rentals` returns JSON:API-formatted responses with 140 attributes per listing, no Cloudflare challenge, no bot defense. Daily Outdoorsy cron no longer consumes Firecrawl credits and completes in seconds instead of minutes. See §11 (2026-04-22 Outdoorsy) for the full investigation.
- [x] **RVshare internal JSON:API discovered and integrated (2026-04-22).** `rvshare.com/rv-rental.json` returns a JSON:API-formatted response with 27 attributes per listing + market-wide histograms (nightly rate, length, generator, fresh-water tank, mileage). No auth, no Cloudflare bot defense, no rate limit observed across 65-page sweeps. Daily RVshare cron no longer consumes Firecrawl credits and completes in ~50s instead of ~480s. See §11 (2026-04-22 RVshare) for the full investigation.
- [x] **Silent bug fixed — Outdoorsy (2026-04-22):** `filter[type]=tt` (used in the old Outdoorsy UI URL) is not recognized by the backend and returns `total=0`; the correct backend enum for travel trailer is `trailer`. Under the old Firecrawl path this masked ~692 SD travel trailers from discovery. New direct-API path uses the correct codes.
- [x] **Silent bug fixed — RVshare (2026-04-22):** the `type=` URL parameter on `rvshare.com/rv-rental(.json)` is **cosmetic** — the backend ignores it. All 8 pre-pivot per-type Firecrawl targets (class-a, class-b, …, truck-camper) returned the **identical** 1,283 SD listings in the same order. The pre-pivot cron was doing ~8× redundant work per day, with the LLM client-side-classifying the same shared universe 8 times over. New direct-API path makes one location-scoped sweep and classifies each listing from `attributes.type`.
- [x] **RVshare one-off backfill via direct API (2026-04-22)** — `scripts/backfill_rvshare_sd.mjs` populated the full SD universe (1,279 unique listings from a reported 1,283 total; 4 cross-page dupes handled by the seen-ID dedup) in 51s. Class breakdown: 601 Travel Trailer · 270 Class C · 132 Class B · 120 Class A · 79 Toy Hauler · 74 Fifth Wheel · 2 Pop Up · 1 Other. Zero errors.

### Phase 2 — Diversified Discovery (Week 1, back half — accelerated)

Rationale for acceleration: every day of relevance-sorted capture bakes biased snapshots into the time-series moat (see §4.3). Bias is not fixable retroactively, so Phase 2 is pulled forward from Week 2 to days 4–7 of Week 1 — but the sort-param verification dependency is preserved so we don't burn credits on a non-functional rotation.

**Days 1–3 (in parallel with Phase 1 stabilization):** establish a default-relevance baseline
- [x] Capture ≥3 days of default-sort snapshots across all active targets — **moot post-2026-04-22 pivot**: default-sort bias is eliminated because we paginate the full universe on every run. `listing_snapshots` has been accumulating since Phase 1.
- [x] Record the per-target URL set each day to measure variant-rotation lift later — `listing_snapshots.source_url` column added in migration `003_snapshot_source_url.sql`; every snapshot now attributes the base `MARKET_TARGETS` URL that surfaced it

**Day 3 — Sort-param verification (COMPLETE 2026-04-21, ~30 credits spent)**
- [x] One-off Firecrawl tests on Outdoorsy Class B San Diego: `sort=price_asc`, `sort=price_desc`, `sort=newest` vs. default
- [x] **Finding:** sort params are **client-side JS only** on Outdoorsy — server returns the identical default-ranked URL set regardless of `sort=`. Server-side `sort` rotation is therefore not a viable diversification lever.
- [x] Price-band filter (`filter[price_low]` / `filter[price_high]`) tested — these **are** server-side but surface the same top-ranked listings filtered by price, not a re-ranked slice. Lift is limited.
- [x] **Pagination (`page[offset]`) tested and confirmed working on Outdoorsy.** Default sort is empirically stable within-class (offset=0 and offset=36 return disjoint URL sets; offset=24 in step of 24 gives no overlap). This contradicts the 2026-04-20 "pagination is a bias trap" assumption for stuck classes — see §11 decisions log (2026-04-21).
- [x] **Bot defense caveat:** Outdoorsy intermittently returns a poison page (`"0 RV rentals"` with 24 empty `Quick Preview` placeholders) on paginated requests when its defense is triggered. Scrapers must treat `"0 results"` as ambiguous — could be end-of-listings or a bot-block. Mitigation: serial class execution with 5s+ cool-downs between classes; retry once on empty responses; don't trust `0` from a pagination step that previously returned data.
- [x] RVshare sort/pagination parity test — **moot post-2026-04-22 pivot.** RVshare's `type=` is cosmetic and the single unified sweep returns 100% of listings. Sort diversification is irrelevant when you already paginate the full universe.

**Days 4–5 — Direct JSON:API pivot, both platforms (revised 2026-04-22 after RVshare parity discovery)**

Strategy revision (2026-04-22): the coverage problem is *solved* on **both** platforms, not improved. Direct JSON:APIs return every listing for every class in one paginated loop at zero credit cost. Phase 2's original "diversify to dodge relevance bias" framing no longer applies — we now get the full ranked universe every day, with `meta.total` / `pagination.totalResults` telling us exactly how many listings exist.

- [x] **Outdoorsy: direct JSON:API client (`lib/outdoorsy-api.ts`) + replaced Outdoorsy branch of `/api/scrape`.** Fetches all pages for each class via `search.outdoorsy.com/rentals?address=…&filter[type]=…&page[limit]=24&page[offset]=N`. 100% coverage per cron run. **2026-04-22.**
- [x] **Outdoorsy: one-off backfill via direct API** — populates the full SD universe (213 Class A + 331 Class B + 411 Class C + 692 Travel Trailer + 56 Fifth Wheel ≈ 1,700 listings) in ~60s.
- [x] **RVshare: direct JSON:API client (`lib/rvshare-api.ts`) + replaced RVshare branch of `/api/scrape`.** Fetches all pages via `rvshare.com/rv-rental.json?location=…&page=N`. Single-sweep covers the entire type-agnostic universe; classification driven by `attributes.type`. 100% coverage per cron run. **2026-04-22.**
- [x] **RVshare: one-off backfill via direct API** — 1,279 unique listings (vs. 1,283 reported) upserted from SD in 51s, zero errors.
- [x] **RVshare: cron config collapsed** — `vercel.json` reduced from `rvshare-1` + `rvshare-2` to a single `rvshare` cron at 06:00 UTC. The pre-pivot per-type groups were a consequence of the 8-target Firecrawl load, which no longer exists.
- [x] **Schema expansion — Outdoorsy** (2026-04-23) — migration `005_schema_expansion.sql` adds `length_ft`, `vehicle_height`, `vehicle_dry_weight`, `vehicle_gvwr`, `sleeps`, `sleeps_adults`, `sleeps_kids`, `instant_book`, `minimum_days`, `cancel_policy`, `delivery`, `delivery_radius_miles`, `primary_image_url`, `location_city/state/lat/lng/zip`, `first_published`, `last_published`, `rental_score`, `sort_score` to `public.listings`. Wired through `scrapeOutdoorsyViaApi` and `scripts/backfill_outdoorsy_sd.mjs`. Zero extra API calls — the JSON:API already returned these on every request, we just weren't persisting them.
- [x] **Schema expansion — RVshare** (2026-04-23) — same migration adds `sleeps`, `length_ft`, `instant_book`, `delivery`, `insurance_status`, `electric_service`, `fresh_water_tank`, `generator_usage_included`, `nightly_mileage_included`, `location_state/lat/lng`, `distance_from_search_miles`, `owner_id`, `premier_owner`, `guest_favorite`, `new_listing_without_reviews`, `primary_image_url`, `weekly_discount_percent`, `monthly_discount_percent`. `sleeps`, `length_ft`, `instant_book`, `delivery`, `primary_image_url`, and `location_{state,lat,lng}` are shared with the Outdoorsy path so the dashboard can filter/aggregate across platforms with one SQL predicate per column. RVshare's `location.name` ("City, ST" free-text) is deliberately NOT written as `location_city` — we leave it NULL rather than store an unparsed blob under a wrong column. Wired through `scrapeRvshareViaApi` and `scripts/backfill_rvshare_sd.mjs`.
- [x] **Market-wide meta snapshots (`search_snapshots`)** (2026-04-23) — new table `public.search_snapshots` captures the rollup meta each API returns on every search. Grain diverges by platform (the APIs diverge, not us): Outdoorsy writes one row per `(platform, market, rv_class, captured_at)` with `price_{min,max,median,average}` + `total_unavailable` + `price_histogram`; RVshare writes one row per `(platform, market, captured_at)` with `rv_class=NULL` (backend is type-blind) and the full `{nightly_rate,length,generator,fresh_water_tank,nightly_mileage}` histograms. `raw_meta` jsonb preserves the untransformed payload for future field extraction without re-fetching. One row per cron run, one row per backfill run — append-only time-series, cannot be backfilled retroactively so it starts ticking the moment the migration runs.

**Days 6–7 — Fan-out**
- [x] **Coverage denominator now live** — `search_snapshots.total_results` gives us the ground-truth platform-reported universe on every cron run; 7-day coverage confirmation is now a SQL query against `search_snapshots`, not an estimate. Outdoorsy SD: 1,703 active listings confirmed. RVshare SD: 1,286 confirmed.
- [x] **Credit consumption confirmed at zero** for SD — both platforms running on direct JSON:API; Firecrawl credits entirely reserved for Phase 3 enrichment and multi-market expansion.
- [ ] Retire both backfill scripts (`backfill_outdoorsy_sd.mjs`, `backfill_rvshare_sd.mjs`) once the daily direct-API crons have run ≥3 consecutive full sweeps without regressions. (Retain as the canonical pattern for bootstrapping new markets.)

### Phase 2.5 — Cross-Platform De-duplication (Week 1, tail-end — IN PROGRESS 2026-04-23)

An RV listed on both Outdoorsy and RVshare currently produces two rows in `listings` with no shared identifier. Without de-duplication, every market-size metric is inflated, every price distribution is skewed, and a host's Phase 4 comp-set can surface their own cross-listing. The canonical solution is a new identity layer (`canonical_vehicles`) that merges confirmed cross-platform duplicates while preserving per-platform time-series. See §4.5 for the precision-vs-recall posture.

- [x] **Migration 007 — detection infrastructure (2026-04-23)** — `pg_trgm` extension; `haversine_miles()` distance function; `rv_make_aliases` lookup table seeded with the common series↔chassis shuffles (Four Winds ↔ Thor, Travato ↔ Winnebago, etc.) that cause the two platforms to label the same RV differently; `normalize_make()` SQL function; `candidate_duplicates` audit table; `detect_duplicate_candidates(market, geo_threshold)` SPI that emits cross-platform pairs with `distance_miles`, `rate_diff_pct`, `mm_sim`, `sleeps_match`, `year_match`, and an initial confidence tier.
- [x] **Manual review tooling (2026-04-23)** — `scripts/detect_duplicates.mjs` runs the SPI and prints tier counts; `scripts/review_duplicates.mjs` renders each candidate pair with listing URLs, primary image URLs, and every signal used by the confidence scorer. Verdicts recorded via the same script (`--verdict match --id N`) into `candidate_duplicates.reviewer_verdict`.
- [x] **API route `/api/detect-duplicates` (2026-04-23)** — thin wrapper around the detection SPI using the same `CRON_SECRET` auth pattern as `/api/scrape`. Not wired to Vercel Cron yet — manual invocation while thresholds stabilize.
- [x] **Migration 008 — first HIGH retune (2026-04-23)** — after reviewing 31 pairs (21 HIGH auto-classified, 10 MEDIUM sample) on the initial thresholds, relaxed `sleeps_match` strict-equality to `abs(diff) ≤ 1` and added an `OR` clause so `distance ≤ 0.5 mi OR rate_diff ≤ 5%` qualifies. Promoted 8 validated MEDIUM matches to HIGH.
- [x] **Migration 009 — geography-only HIGH (2026-04-23)** — spot-check on the 15 newly-promoted HIGH pairs from 008 surfaced one false positive: two 2025 Coleman 17B travel trailers in Menifee with identical year/make/model/rate/sleeps/length but different physical RVs. The rate-identity clause was insufficient to discriminate commoditized inventory in fleet cities. Reverted to AND-gated geography: HIGH now requires `distance_miles ≤ 0.5`. Trade-off: one confirmed match (#2113, a 38-mile-apart same-owner pair) drops back to MEDIUM where reviewer verdict can promote it; zero auto-linked false positives in exchange. After the re-scoring pass, 4 additional rate-only-at-2mi HIGH rows dropped to LOW (one Coleman 17B + three Jayco/Durango at identical $99–$125 nightly in the same 2.13mi privacy-fuzz cluster), collapsing HIGH from 36 to 32 and dissolving one 3-way canonical component into two clean 2-ways.
- [x] **Migration 010 — canonical vehicles schema + promotion SPI (2026-04-23)** — `canonical_vehicles` table (market, primary_listing_id, denormalized year/make/model/class/length/sleeps, platforms[], listing_count, listing_ids[], source), `listings.canonical_vehicle_id` FK, and `promote_candidates_to_canonical(market)` SPI that runs connected-components over `(confidence='high' AND reviewer_verdict != 'not_match') OR reviewer_verdict = 'match'` edges via a recursive-CTE BFS. Handles N:M merges (one owner's two Outdoorsy listings matching one RVshare listing collapse to one canonical vehicle) via the cross-platform bridge — detection only emits `outdoorsy ↔ rvshare` pairs, so same-platform duplicates surface through transitive closure. Re-runnable: canonicals are re-derived from the audit table on every call. First SD run produced 30 canonicals from 32 HIGH edges (2 three-listing components, 28 two-listing).
- [x] **Dashboard rewire (2026-04-23)** — `app/dashboard/page.tsx` dedupes fetched listings client-side via a `useMemo` that groups by `canonical_vehicle_id ?? id` and picks a representative per group (most-reviewed listing; ties broken by most-recent `scraped_at`). Every metric card, the rate-distribution histogram, the "priced in last 7d" count, the "last updated" timestamp, and the comp-listings table render from the deduped array. Cross-listed rows display both platform badges plus a `×N cross-listed` indicator and an `avg of N` caption on the nightly rate. The honest-aggregate badge surfaces both numbers when dedup is active: `312 unique RVs (324 raw listings, 12 cross-platform dupes merged)`. Fully backward-compatible — singletons (no canonical row) fall through to their own id and render identically to the pre-dedup UI.
- [ ] **`/api/rate-history` canonical-awareness** — the time-series chart still aggregates raw `listing_snapshots` rows, so a cross-listed RV's snapshots still contribute twice to historical averages. Fix is server-side: join `listing_snapshots` → `listings` → `canonical_vehicle_id`, then group by `COALESCE(canonical_vehicle_id, listing_id)` before rolling up per-day. Not urgent — the cross-listed overlap is ~30 units in SD so the time-series skew is <1% right now.
- [ ] **Observability** — weekly canonical-ization report: auto-linked count, reviewer queue depth (unreviewed MEDIUM), false-negative estimate from reviewer 'match' verdicts on pre-migration candidates.
- [ ] **Image-hash backstop (deferred)** — perceptual hash of `primary_image_url` to re-open a rate-identity-based HIGH tier for the ~2% of cross-listings where both listings are >0.5 mi apart (owner's home vs. storage yard). Defer until MEDIUM queue pain is demonstrated — currently 32/33 reviewed pairs classify correctly without pHash.

### Phase 3 — Detail Enrichment (Weeks 2-3)

**Scope revised 2026-04-23.** The schema expansion (migration 005) captured `length_ft`, `sleeps`, `delivery`, `delivery_radius_miles`, `minimum_days`, `cancel_policy`, and `instant_book` from search-page APIs for 100% of active inventory — eliminating most of the originally planned enrichment work. Phase 3 now targets the **residual detail-page-only fields** that neither search API exposes.

- [ ] New route: `/api/enrich`
- [ ] Residual schema additions: `slides`, `fuel_type`, `delivery_per_mile_fee`, `cleaning_fee`, `solar`, `pet_policy`, `photo_count`, `host_response_rate`, `host_response_time`
- [ ] Nightly cron drains oldest `enriched_at IS NULL` queue (lowest `scraped_at` first — ensures oldest-discovered listings get enriched before new ones)
- [ ] Banner on dashboard: "X of Y listings enriched (amenity detail)"
- [ ] Note: for RVshare, `electric_service`, `fresh_water_tank`, `generator_usage_included`, and `nightly_mileage_included` are now populated at search-page discovery; do not re-fetch these from detail pages.

### Phase 4 — Occupancy & Comp-Sets (Weeks 4-7)
- [ ] Weekly calendar scrape → `availability_snapshots`
- [ ] Materialized view: rolling 30-day occupancy inference per listing
- [ ] Comp-set UI: kNN query on attributes + time-series aggregate over the set
- [ ] Gated behind paid tier

### Phase 4.5 — Benchmark My Listing (Weeks 5-7, overlaps Phase 4)

A public-facing "paste your listing URL → get a benchmark report" tool, modeled on AirDNA's Rentalizer. Doubles as the top-of-funnel acquisition magnet for the waitlist and the highest-intent upsell surface for paid tiers: the host lands on their own report and sees exactly what they're missing.

**Input:** a single Outdoorsy or RVshare listing URL (optionally unauthenticated for the free teaser; gated for the full report).

**Pipeline:**
1. Parse URL → resolve to `listings.id` if already in registry (the full SD registry is populated with core comp-set attributes as of 2026-04-23 schema expansion); else one-shot `/api/enrich` to ingest it (≤5 credits, synchronous, cached 24h)
2. Pull latest snapshot for price + attributes; fall back to live scrape if `scraped_at > 48h`
3. Run the Phase 4 kNN comp-set over the listing's attributes (`rv_class`, `length_ft`, `sleeps`, `delivery_radius_miles`, `location_{lat,lng}`) — all five dimensions are now populated at discovery time for in-registry listings; Phase 3 enrichment adds `slides`, `solar`, `pet_policy` as optional refinement dimensions
4. Compute benchmark deltas against the comp-set and the market rollup (use `search_snapshots.price_median` for the market-level reference price rather than re-aggregating from individual listing rows)

**Report surface (single scrollable page):**
- **Header card:** the host's listing — hero image, title, class, price, "benchmarked against 42 similar RVs in San Diego, data fresh as of [timestamp]"
- **Price percentile:** "$185/night — you're in the 38th percentile for Class B in San Diego. Median is $210."
- **Comp-set table:** 8 nearest listings side-by-side (price, length, sleeps, delivery, fees, occupancy signal)
- **Fees & policies audit:** host's cleaning fee / delivery fee / min-nights vs. comp-set median (surfaces hidden competitiveness gaps)
- **Occupancy gap** (gated, Phase 4 dependency): "Comp-set is booked 62% of the next 30 days. You're at 34%."
- **Suggested price band:** "Comparable listings in your percentile tier charge $195-$240. Raising to $215 would move you to the 55th percentile without pricing you above your comp-set."
- **Methodology drawer:** sample size, freshness, which attributes drove kNN weighting — consistent with §7.1's honesty posture

**Gating model:**
- Free teaser (unauthenticated): header card + price percentile + anonymized comp-set count. No per-comp detail, no occupancy, no price suggestion. Email wall to unlock the rest → feeds waitlist.
- Full report (paid tier, or time-limited trial post-waitlist-activation): everything above.
- Rate limit: 3 URL lookups per IP per day unauthenticated, to cap enrichment credit spend from curiosity traffic.

**Engineering notes:**
- New route: `/benchmark` (public) and `/benchmark/[listing_id]` (shareable permalink, cached 24h)
- New API: `POST /api/benchmark` → returns report JSON; reuses `/api/enrich` for cold URLs
- New table: `benchmark_reports` — `(id, listing_id, requested_by_email, created_at, report_json, visibility)` — so each report is cacheable, shareable, and attributable for funnel analytics
- Reuses Phase 4 comp-set engine verbatim; do not fork
- Triggers a cold enrichment path — validate `/api/enrich` handles one-off URLs cleanly before Phase 4.5 ships

**Success metrics:**
- ≥20% of waitlist signups originate from a benchmark report (funnel attribution)
- Median time-to-first-report <15s on cached listings, <90s on cold URLs
- Benchmark → paid conversion ≥2× the marketing-site baseline

### Phase 5 — Sweeper & Cleanup (Ongoing)
- [ ] Daily sweeper cron flips `is_active = false` when `last_seen_at < now() - 14d`
- [ ] Env var hygiene: re-set Supabase URL/anon key cleanly (currently has literal `\n` inside stored values)
- [ ] Move to Firecrawl Growth tier once expanding beyond San Diego

### Access gating (progressive, cross-phase)

Three tiers of protection for `/dashboard`. We ship only the tier the current phase actually needs — each tier has different cost, different blast-radius, and different user-experience commitments. **The cost of auth is ongoing, not one-time** (sessions, password resets, email deliverability, provider migrations), so we hold at the lowest tier that clears the current threat model.

**Tier 1 — Passcode splash (SHIPPED 2026-04-20)**
- [x] `middleware.ts` intercepts `/dashboard/*`, redirects to `/early-access` when the `rvintel_access` cookie is missing or stale
- [x] `/early-access` page with a shared-passcode form + server action that validates against `DASHBOARD_ACCESS_CODE` and sets a signed cookie containing `DASHBOARD_ACCESS_SIGNATURE`
- [x] Env vars documented in `.env.local.example`; both unset = gate disabled (dev-friendly, mirrors `CRON_SECRET` pattern)
- [x] Migration `004_listings_rls.sql` makes the anon-readable posture on `public.listings` explicit (RLS ON with a named SELECT policy, not implicit RLS-OFF)

What Tier 1 protects: link-preview crawlers, casual visitors, anyone who hasn't been handed the passcode.
What it does **not** protect: the Supabase `listings` table itself — the anon key is still shipped in the client bundle and `listings` has an `anon` SELECT policy. A determined visitor who opens devtools can still hit the Supabase REST endpoint directly. That is acceptable while there is nothing behind the login that is not also visible in the marketing site.

**Tier 2 — Server-rendered dashboard + session-gated data (TRIGGER: start of Phase 4)**

Move the dashboard from a client component that queries Supabase with the anon key to a React Server Component that queries with the service role key. At that point the anon key can no longer read `listings` and Tier 1's cosmetic gate becomes a real data gate.

- [ ] Rotate `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the current one is already exposed in every deploy's client bundle
- [ ] Refactor `app/dashboard/page.tsx` to an RSC that loads listings server-side via the service role
- [ ] Drop the `listings_anon_read` policy introduced in `004_listings_rls.sql`; anon now sees zero rows
- [ ] Replace shared-passcode auth with a waitlist-scoped magic-link flow (email token → signed session cookie), keeping the `waitlist` table as the source of truth for who gets in
- [ ] Middleware validates the session cookie's HMAC + expiry instead of comparing against `DASHBOARD_ACCESS_SIGNATURE`
- [ ] Interactive dashboard controls (market/class selects, refresh) become server actions or narrow client islands that call server functions — never Supabase directly

Why Phase 4 is the trigger: comp-sets are the first feature where logged-in state matters (each user's set is different, and comp-sets are paid-tier gated). Shipping Tier 2 earlier means owning the session infrastructure before any feature needs it — auth maintenance without auth payoff.

**Tier 3 — Full auth provider + per-user RLS (TRIGGER: paid-tier launch)**

Only when we're charging money or when a feature needs user-scoped data (saved filters, host-claimed listings, B2B orgs for the fleet tier).

- [ ] Pick a provider — default recommendation is **Clerk via Vercel Marketplace** (native integration, rich UX, webhook to Supabase for user mirroring). Supabase Auth is the alternative if consolidating on one vendor matters more than the Clerk UX.
- [ ] Stripe integration for paid tiers, mirroring subscription status into the users table
- [ ] RLS rewrite on `listings`, `listing_snapshots`, and any future user-scoped tables — policies gate on `auth.uid()` and subscription tier claims
- [ ] Migrate Tier 2 magic-link users into the provider (or invalidate and ask them to re-register — acceptable pre-scale)
- [ ] Organization/team model deferred until the fleet tier has signal (per §3, ≥90 days of time-series)

Why not earlier: Tier 3's RLS model depends on knowing what users actually do. Designing user-scoped policies before the product has user-scoped features produces speculative RLS that gets rewritten when real features ship — with production user data in the middle of the migration.

### Phase 6 — Multi-Market Expansion (Weeks 7+)
- [ ] Add LA, Phoenix, Denver, Austin, Seattle, Miami, Nashville, Portland, Vegas
- [ ] Add **RVezy** and **RVnGO** as P2P scrape targets (deferred from Phases 1–5)
- [ ] Upgrade Firecrawl to Growth (20k credits/mo) — needed once scraping ≥3 markets

---

## 9. Success metrics

| Metric | Week 1 target | Week 1 actual (2026-04-23) | Week 4 target | Quarter 1 target |
|---|---|---|---|---|
| Markets covered | 1 | **1** | 1 | 10 |
| Unique listings in registry | 300+ | **~2,980 active** (~3,356 total incl. stale) | 3,000+ | 40,000+ |
| % listings priced in last 7d | 70% | **100%** (full-universe daily sweep, both platforms) | 100% | 99% |
| % active listings with core comp-set attrs | 0% | **~99%** (length, sleeps, delivery, location from search APIs) | 100% | 99% |
| % listings with detail-page enrichment | 0% | **0%** (Phase 3 not yet started) | 60% | 90% |
| `listing_snapshots` captured | 300 | **~6,000+** (both backfills + prior cron runs) | 100,000+ | 2M+ |
| `search_snapshots` captured | — | **12** (5 Outdoorsy class-grain + 2 RVshare market-grain, first day) | 300+ | 3,000+ |
| Cross-platform HIGH-tier auto-links | — | **32 pairs → 30 canonical_vehicles** (2 three-listing components, 28 two-listing); 62 listings collapsed to 30; 2.47% of smaller platform (rvshare) de-duplicated | 500+ | 5,000+ |
| MEDIUM-tier review queue depth | — | ~200 pairs pending verdict | <100 steady-state | <500 steady-state |
| Waitlist signups | 50 | — | 200 | 1,000 |
| Paid conversions | 0 | 0 | 10 | 50 |

---

## 10. Risks & open questions

### Technical risks
- **Firecrawl is now a dormant fallback only.** Both platforms moved to direct JSON:APIs on 2026-04-22. Firecrawl is exercised zero times in steady state. It remains wired behind `OUTDOORSY_SCRAPER` and `RVSHARE_SCRAPER` env flags, so the rate-limit / queueing / credit-waste failure modes only resurface if we flip a fallback on — which in turn only happens if an API gets gated.
- **Direct APIs could be shut down or gated — Outdoorsy.** `search.outdoorsy.com/rentals` is undocumented and required no auth as of 2026-04-22. Outdoorsy could at any time rate-limit it, require a signed header, or move search behind auth. Mitigation: (1) the Firecrawl+LLM path still works and is kept dormant in the codebase as a fallback, not deleted; (2) monitor `cron_runs` for Outdoorsy status; on three consecutive failures, flip `OUTDOORSY_SCRAPER=firecrawl` without a deploy. Long-term, if the API stays stable for 90 days, the fallback can be retired.
- **Direct APIs could be shut down or gated — RVshare.** `rvshare.com/rv-rental.json` is a Rails respond_to negotiation (the same URL returns HTML for browsers via Hypernova SSR and JSON for `Accept: application/json`). It is effectively a public rendering of the search page and therefore harder to shut down than Outdoorsy's dedicated `search.` subdomain — RVshare would have to break their own SSR pipeline to block us. Mitigation follows Outdoorsy's pattern: `RVSHARE_SCRAPER=firecrawl` flag restores the 8-target Firecrawl path without a deploy (note: that path inherits the cosmetic-`type=` redundancy — 8× credits for ~1× distinct listings).
- **Cross-page duplicate handling (RVshare).** The RVshare backend reorders listings slightly between pages on busy days — our 2026-04-22 backfill saw 4 cross-page duplicate IDs out of 1,283. Already handled by the `seenIds` Set in both `lib/rvshare-api.ts#fetchRvshareMarket` and the route-side upsert. Worth re-verifying if the universe count ever drops unexpectedly.
- **Platform bot protection — poison-page variant (Outdoorsy UI, observed 2026-04-21).** Still a hazard if we ever scrape `www.outdoorsy.com` again (e.g. for detail-page enrichment). The search API path does not exhibit this behavior; but any future per-listing detail-page scrape must re-encode the retry/serial/cool-down posture or inherit the hazard.
- **Config hygiene.** `.env.local` currently stores some values with literal `\n` inside the quoted strings; Next.js's built-in dotenv tolerates this, but hand-rolled parsers (e.g. the backfill scripts' env loaders) must expand-and-trim or every DB write silently 204s into the void. Tracked in Phase 5.
- **Occupancy inference accuracy.** Calendar diffs assume "available → booked" means "booked" — but hosts also block dates manually. Need to validate against 1-2 known-booked listings.
- **Canonical-vehicle false negatives in fleet cities.** The current HIGH-tier geography-only rule (`distance ≤ 0.5 mi`) will miss same-owner pairs where the two platforms expose different coordinates — typically home vs. storage yard, or one platform's privacy-fuzzed centroid vs. the other's true pin. Mitigation today is reviewer verdict; long-term mitigation is the deferred pHash backstop. Monitor MEDIUM queue growth: if it accumulates >500 unreviewed pairs across all markets, escalate the pHash work before launching more markets.
- **`normalize_make` alias coverage.** The `rv_make_aliases` seed list covers the dozen-ish series↔chassis shuffles observed on SD inventory. New markets will surface new aliases (especially regional fleet operators who brand their units), and an un-aliased make pair drags `mm_sim` below 0.60 and drops real matches out of detection entirely. When adding a market, run `detect_duplicates --tier medium --sample 50` and harvest alias candidates from mismatched-make rows before promoting.
- **Outdoorsy sentinel timestamps.** The Outdoorsy API returns `"0000-12-31T16:07:02-07:52"` for `first_published` / `last_published` on some listings where those fields are unset. Postgres `timestamptz` rejects year-0000 values as out-of-range. Mitigated in `lib/outdoorsy-api.ts` (`asTimestamp` helper rejects pre-epoch strings) and in the backfill script (`asTs` helper). Any future consumer of these columns must be aware the field is nullable for this reason.
- **RVshare decimal-valued spec fields.** Fields like `fresh_water_tank`, `electric_service`, `generator_usage_included`, and `nightly_mileage_included` are returned as floats (e.g. `"40.5"` gallons) despite appearing integer in most documentation. Migration 006 relaxed these columns to `numeric`. Do not assume integer semantics when doing arithmetic on these.

### Product risks
- **Coverage ≠ value.** Users must understand even a comprehensive dataset requires time depth to be actionable. Messaging is "rigorous daily methodology," not "we have every listing." (Updated from the bootstrap-era framing — we now genuinely have full SD coverage.)
- **Time-series patience.** Comp-sets need ≥60 days of snapshots to be interesting. `search_snapshots` started ticking 2026-04-23. Launch messaging must manage expectations during bootstrap.
- **Competitive moat.** Once the time-series depth exists, a copycat is 60+ days behind. Moving fast on expansion is the best defense.
- **`rental_score` / `sort_score` interpretation.** These are Outdoorsy-internal signals whose weighting is undocumented. We can surface them as relative rankings within our dataset, but we cannot claim to know exactly what drives them. Present as "platform visibility rank" with a methodology disclosure, not as an absolute score.

### Open questions
- ~~Do Outdoorsy and RVshare respect server-side `sort` params, or is sorting client-side JS?~~ **Answered 2026-04-21 for Outdoorsy, moot 2026-04-22 for both platforms:** direct JSON:APIs return the canonical ranked universe on each platform; sort params on the UIs are no longer on our critical path. RVshare's `type=` filter turned out to be cosmetic (2026-04-22) — by extension we should assume any RVshare search-UI querystring is decorative until proven otherwise, and lean on client-side classification from `attributes.type` wherever possible.
- ~~Does the two-tier scrape architecture ship before or after Phase 2 pagination expansion?~~ **Resolved 2026-04-22:** moot for both platforms — direct APIs obsolete LLM extraction entirely. The two-tier pattern survives as a mental model for any future platform that doesn't expose a JSON endpoint (e.g. RVezy, RVnGO in Phase 6).
- ~~Does RVshare have an undocumented search API equivalent to Outdoorsy's?~~ **Answered 2026-04-22:** yes — `rvshare.com/rv-rental.json` is a Rails JSON respond_to negotiation on the same path as the HTML search page. Auth-free, bot-defense-free, rate-limit-free in 65-page sweeps. See §11 (2026-04-22 RVshare).
- Is there a legal ceiling on scrape volume per platform? (Monitor; rotate request shape; the direct-API paths are lower profile than Firecrawl's headless browser, but both are still undocumented access.)
- When does fleet-tier pricing make sense to launch? (Gate on having ≥30 days of trend data + occupancy.)

---

## 11. Decisions log

- **2026-04-20:** Chose **diversified-query discovery** over rotating page offsets. Offset rotation assumed stable global sort; platforms use relevance-weighted sorts that shuffle daily, producing biased samples regardless of pagination depth.
- **2026-04-20:** Chose **search-page pricing refresh** over detail-page refresh. Search returns 12 prices per fetch at 5 credits; detail returns 1 price per fetch at 5 credits. 12× cost difference for identical data.
- **2026-04-20:** Chose **single 120s Firecrawl timeout** over per-platform timeouts. LLM extraction is the slow step on both platforms; a too-tight timeout wastes successful Firecrawl responses and credits.
- **2026-04-20:** Deferred **Firecrawl Growth upgrade** until multi-market expansion. Hobby 3k credits/mo fits single-market daily cadence with ~600 headroom.
- **2026-04-20:** **RVezy** and **RVnGO** deferred to Phase 6; **Motorhome Republic** and **Campanda** excluded permanently (fleet/dealer pricing, not P2P).
- **2026-04-20:** **Pulled Phase 2 (Diversified Discovery) from Week 2 into the back half of Week 1.** Relevance-sorted capture produces biased snapshots, and principle 4.3 makes that bias permanent — every day of delay corrupts the time-series moat we cannot backfill. Acceleration preserves the sort-param verification dependency (day 3) and adds a days 1–3 default-sort baseline so variant lift is measurable rather than assumed.
- **2026-04-20:** **Added "Benchmark My Listing" as Phase 4.5** (AirDNA Rentalizer analog). Chose to piggyback on the Phase 4 comp-set engine rather than build a parallel pipeline — same kNN, same snapshots, applied to a user-supplied URL instead of a dashboard filter. Placed it *after* Phase 4 because occupancy gap is the differentiating insight vs. pure price comparison, and occupancy requires the calendar scraper. Free-tier teaser + email gate is the acquisition lever; full report is a paid-tier upsell, so it doubles as top-of-funnel and bottom-of-funnel in one surface.
- **2026-04-20:** **Shipped Tier 1 dashboard gate (passcode splash) instead of full auth.** The dashboard had no access control — a public URL serving what will eventually be a paid product. Tier 1 (middleware + shared passcode) closes the visibility gap in an hour without committing to a provider, session model, or RLS rewrite before there is a logged-in feature to justify them. Tiers 2 and 3 are staged to trigger at Phase 4 (comp-sets) and paid-tier launch respectively, so each layer of auth cost buys a concrete user-facing capability rather than speculative infrastructure.
- **2026-04-21:** **Split Outdoorsy into two crons (`outdoorsy-1`, `outdoorsy-2`) ~40 min apart; bumped `CALL_TIMEOUT_MS` 120s → 180s.** Symptom: `outdoorsy-1` was recurringly completing with `status=partial`, 2 errors — a 120s timeout on Class C (LLM extraction ran ~125s) and an `ERR_EMPTY_RESPONSE` from Outdoorsy's bot defense on Travel Trailer, caused by four near-simultaneous per-class queries arriving from overlapping Firecrawl IPs. The split (b+a at 06:20, c+tt at 07:00) gives the stealth proxy time to rotate IPs between batches, and the 180s timeout stops discarding successful responses whose LLM pass legitimately exceeds 120s. Both fixes ship together because either alone leaves the other failure mode unaddressed.
- **2026-04-21:** **Chose pagination over sort rotation for Outdoorsy coverage on stuck classes.** The 2026-04-20 "pagination is a bias trap" stance assumed platforms use relevance-weighted sorts that shuffle daily; Outdoorsy empirically does not. Default sort is stable within-class across same-day requests (verified by diffing URL sets from offset=0 vs. offset=36), and `sort=` params are client-side JS only (server ignores them). That stable ordering is precisely what makes pagination a valid lever here: a 13-page sweep at `page[offset]` step 24 covers ~300 listings with zero overlap. For RVshare, where cron runs show ~3 new listings per class per day, rotation remains the likely answer (pending verification). The PRD's default stance is now **"the lever depends on whether the platform's default sort is stable"**, not "rotation always beats pagination."
- **2026-04-21:** **Two-tier scrape architecture adopted as a strategic direction.** JSON extraction is ~60-150s per page and consumes 25 credits/call with stealth; markdown-only scrapes are 3-5s and 1 credit. The two-tier pattern: (1) a daily "refresh" pass that fetches search pages in plain markdown and updates prices for URLs already in `listings` via regex, and (2) a much narrower "enrichment" pass that runs LLM JSON extraction only on URLs not yet in the registry. This cuts steady-state credit spend ~4× and decouples price refresh latency from the LLM. Deferred to Phase 2 days 4–5 because it unlocks raising `MAX_PAGES` without blowing the Hobby credit ceiling.
- **2026-04-21:** **Built `scripts/backfill_outdoorsy_sd.mjs` as a one-off bootstrap tool, not a cron.** Runs locally so it dodges Vercel's 300s function cap (a 13-page sweep across 4 classes is ~15-30 min), reuses the scrape route's schema and classification rules, logs to `cron_runs` under `platform='outdoorsy-backfill'` for observability parity, and deletes itself from the active surface once steady-state coverage matches its output. Kept as a reference pattern for future market bootstraps; the day we add LA or Phoenix, the same script shape applies.
- **2026-04-21:** **Outdoorsy's "0 results" poison page documented as a first-class scraper hazard.** Previously treated as a transient bot-block. Empirically: triggered paginated requests receive a syntactically valid page with `"0 RV rentals"` text and 24 empty `Quick Preview` markers, which an LLM extractor correctly reports as zero listings. A scraper that treats 0 listings as "end of pagination" stops early and under-counts coverage. The backfill script encodes the mitigation: retry once on empty, serial class execution, 5s cool-downs between classes, and distrust of `0` when the prior page returned full data. Any future per-page cron needs to inherit this same posture.
- **2026-04-22:** **Discovered Outdoorsy's internal JSON:API at `search.outdoorsy.com/rentals` and moved the entire Outdoorsy ingestion path off Firecrawl onto direct HTTPS.** Investigation chain: (1) fetched the `/rv-search` HTML via Firecrawl stealth to inspect `__NEXT_DATA__` and Redux initial state — pageProps were empty (page is client-hydrated, not SSR-driven), but `initialReduxState.rentals.currentFilters` leaked the exact backend query shape (`filter[type]`, `page[limit]`, `page[offset]`, `price[min/max]`, `date[from/to]`, `sleeps[adults/children]`); (2) CT-log subdomain enumeration surfaced `api.outdoorsy.com` and `search.outdoorsy.com`; (3) direct curl to `https://search.outdoorsy.com/rentals?address=San+Diego,+CA&filter[type]=b` returned a 200 with standard JSON:API `{data, included, meta}` and no Cloudflare challenge. **Impact:** Outdoorsy daily cron moved from ~180s + 40 credits/day (Firecrawl+LLM) to ~15s + 0 credits/day; per-listing payload expanded from ~10 regex-parsed fields to 140 native attributes (unblocks most of Phase 3 enrichment with zero extra calls); market-wide stats (`meta.total`, `meta.price_histogram`, `meta.price_median`) now come free on every call. Coverage ceiling changed from "~55% via default-sort page 1" to **100% every day** — with `meta.total` providing a ground-truth denominator the old path could never produce.
- **2026-04-22:** **Silent bug: `filter[type]=tt` is a UI-only enum, not a backend enum.** The old Firecrawl-based Outdoorsy cron built URLs with `filter[type]=tt` (copied from the `outdoorsy.com/rv-search` UI querystring). The search UI accepts this and client-side-filters a broader server response down to travel trailers; the backend API at `search.outdoorsy.com/rentals` treats `tt` as an unknown filter and returns unfiltered results (or `total=0` on the direct-API probe). Empirically confirmed: `filter[type]=tt` → `total=0`; `filter[type]=trailer` → `total=692` for San Diego. The old cron has been under-counting SD travel trailers by roughly 5-10× for its entire lifetime. Fix rolled out alongside the direct-API pivot: backend-correct filter codes are `a`, `b`, `c`, `trailer`, `fifth-wheel`.
- **2026-04-22:** **Retained the Firecrawl-based Outdoorsy code path as a dormant fallback rather than deleting it.** Rationale: the direct-API endpoint is undocumented. If Outdoorsy adds auth, rate limits aggressively, or redesigns the API, we need a same-day recovery path that already works in production. The Firecrawl path is now gated behind an `OUTDOORSY_SCRAPER` env flag (`api` | `firecrawl`, default `api`); flipping the flag in Vercel does not require a deploy. Once the direct-API path runs clean for ≥90 days, the fallback can be retired.
- **2026-04-22 (RVshare):** **Discovered RVshare's internal JSON:API at `rvshare.com/rv-rental.json` and moved RVshare ingestion off Firecrawl onto direct HTTPS.** Investigation chain, run immediately after the Outdoorsy pivot landed: (1) fetched the `/rv-rental?location=san+diego+ca` HTML and grepped for embedded data structures — found a `<script type="application/json" data-hypernova-key="CombinedSearchExplorer">` block holding a *complete* server-rendered search response (Airbnb's Hypernova SSR framework); (2) CT-log enumeration surfaced `api.rvshare.com`, but probing it returned HTTP 401 with a Rails Devise `"You need to sign in or sign up before continuing"` body — that subdomain requires full user auth and is unusable for anonymous scraping; (3) on a hunch, re-requested the search URL with `Accept: application/json` — Rails respond_to returned the raw JSON envelope directly, no HTML wrapper, no auth required; (4) appended `.json` extension to the path and observed identical behavior with or without the Accept header, confirming the endpoint is deliberately public; (5) paginated via `&page=N` cleanly through 65 pages of SD inventory with `pagination.totalResults=1283` on every response. **Impact:** RVshare daily cron moved from ~480s + 40 credits/day (8 Firecrawl+LLM targets) to ~50s + 0 credits/day (single paginated sweep); per-listing payload expanded from ~10 LLM-regex-parsed fields to 27 native attributes plus 5 market-wide histograms (nightly rate, length, generator usage, fresh-water tank, nightly mileage) on every call. Coverage ceiling changed from "~15% per class via page-1 Firecrawl" to **100% every day** with `pagination.totalResults` as the ground-truth denominator.
- **2026-04-22 (RVshare):** **Silent bug: `type=` URL parameter on RVshare is cosmetic.** The pre-pivot cron hit 8 per-type URLs daily (`type=class-a`, `type=class-b`, …, `type=truck-camper`) on the theory that each returned a class-filtered result set. Empirically — and verified across the Hypernova SSR payload, the `.json` API response, and the HTML rendering — the RVshare backend **ignores** `type=` entirely: all 8 URLs returned the identical 1,283 SD listings in the same order. The LLM was silently client-side-classifying the same shared universe 8 times per day. The filtering visible to a browser user is applied by client-side JS post-hydration. **Impact:** `vercel.json` collapsed from 2 RVshare crons (`rvshare-1`, `rvshare-2`) covering 4+4 per-type targets to a single unified `rvshare` cron that makes one location-scoped sweep and categorizes from `attributes.type`. Classification distribution from the 2026-04-22 backfill (1,279 rows): Travel Trailer 601 · Class C 270 · Class B 132 · Class A 120 · Toy Hauler 79 · Fifth Wheel 74 · Pop Up 2 · Other 1. The one "Other" was a Jay Flight Bungalow (park model / destination trailer); lookup table in `lib/rvshare-api.ts` can grow as new `attributes.type` strings appear.
- **2026-04-22 (RVshare):** **Retained the Firecrawl-based RVshare code path as a dormant fallback, gated behind `RVSHARE_SCRAPER` env flag.** Symmetric with the Outdoorsy decision above. Same rationale: if RVshare ever blocks the JSON endpoint or breaks their Hypernova pipeline, we need a same-day recovery without a deploy. One caveat: if the Firecrawl fallback is ever activated, it inherits the cosmetic-`type=` redundancy (8 targets × 1 page × 5 credits = 40 credits/day for ~1× distinct listings vs. a single API call). If RVshare's JSON endpoint stays stable for 90 days, retire the Firecrawl path rather than also fixing its redundancy.
- **2026-04-23:** **Schema expansion (migrations 005 + 006) — persisted all high-value fields both APIs already returned.** Pre-expansion we were writing ~10 columns per listing; both APIs were returning 27-140 attributes that we fetched and discarded. Migration 005 added 9 shared columns, 13 Outdoorsy-only columns, and 12 RVshare-only columns to `public.listings`, plus the new `search_snapshots` table for market-wide rollup time-series. Migration 006 relaxed 4 RVshare spec columns from `integer` to `numeric` after the first backfill caught decimal values (`fresh_water_tank=40.5` etc.). **Impact:** ~82-100% of Phase 3's originally planned "enrichment" work is now done at zero additional API cost — `length_ft`, `sleeps`, `delivery`, `delivery_radius_miles`, `minimum_days`, `cancel_policy`, `instant_book`, and `location_{lat,lng,state}` are fully populated for active SD inventory on both platforms. Phase 3 scope is now narrowed to the 8-9 genuinely detail-page-only fields.
- **2026-04-23:** **Two data-quality bugs found by running the expanded backfills.** (1) Outdoorsy returns `"0000-12-31T16:07:02-07:52"` as a sentinel for unset `first_published` / `last_published` fields; Postgres rejects year-0000 as out-of-range for `timestamptz`, causing entire 50-row upsert chunks to fail silently. Fixed with an `asTimestamp` / `asTs` helper that treats pre-epoch strings as `null`. (2) RVshare returns float values (e.g. `"40.5"`) for fields we typed as `integer` in migration 005 — same chunk-failure behavior. Fixed with migration 006 (`alter column type numeric`). Lesson: always run the backfill immediately after any schema migration that adds new write paths — the backfill stress-tests the full real-world value range in a controlled way that cron runs (which only write new/changed rows) would take days to surface.
- **2026-04-23:** **Built cross-platform duplicate detection (migrations 007–009) before adding new markets.** The scraped dataset has two platforms sitting side-by-side with no shared identifier; every market-size chart on the dashboard double-counts cross-listed RVs, and a host's Phase 4 comp-set can include their own listing from the other platform — the single most trust-breaking failure mode the dashboard can exhibit. Chose a three-migration rollout — detection-only, retune HIGH thresholds on reviewed data, tighten again after a false positive — rather than shipping one speculative migration. The discipline paid off: migration 008 promoted 15 medium pairs to HIGH based on a rule that passed review on 31 pairs, and migration 009 caught the one case where that rule failed (a pair of commoditized 2025 Coleman 17B trailers in Menifee at identical $99/night but 2.41 miles apart — same model, different owners, same fleet market) before any false positive reached the dashboard. The `canonical_vehicles` table + `canonical_vehicle_id` FK ships next in migration 010; until then the detection output is observable but not wired into any aggregate.
- **2026-04-23:** **Chose geography-only HIGH tier over image-hash gating for canonical promotion.** The Coleman 17B false positive surfaced in migration 008 review demonstrated that stored numeric/string signals alone cannot discriminate same-model-different-owner pairs from same-owner-cross-listed pairs in high-density fleet zones — rate identity is a market-level signal for commoditized inventory, not an owner-level signal. The discriminating bit is the primary image (a same-RV cross-listing typically shares the owner's actual photos; two different units have visibly different angles / interiors / surroundings). Options considered: (a) tighten HIGH geography to `≤ 0.5 mi` and accept that rate-only real matches drop to MEDIUM where reviewer verdict promotes them (chosen); (b) add a `primary_image_phash` column, backfill ~3,400 Cloudinary/imagedelivery.net URLs, and let image-similarity discriminate the rate-only tier. Option (b) is ~2–3h of engineering + the backfill, and reopens the exact HIGH-tier failure mode for stock-photo fleet operators where all units share the manufacturer's hero image. Deferred until (a) shows measurable MEDIUM queue pain. The tightened rule classifies 32/33 reviewed pairs correctly; the one lost match is recoverable via `reviewer_verdict='match'` and will be re-promoted by migration 010's SPI on the next run.
- **2026-04-23:** **Outdoorsy `meta.price_*` fields are in cents, not dollars.** Discovered during verification after the backfills — `search_snapshots.price_median = 29600` for Class A (should be $296, not $29,600). The per-listing `price_per_day` field is also in cents (already known and handled with `/100` division), but we missed applying the same conversion to the meta price stats when inserting `search_snapshots`. Fixed in `lib/outdoorsy-api.ts#normalizeMeta` (added `centsToDollars` helper), the backfill script, and a one-shot data-fix script (`scripts/fix_outdoorsy_search_snapshot_units.mjs`) that corrected the 10 existing stale rows. Going forward: treat every Outdoorsy numeric money field as cents until proven otherwise.
- **2026-04-23:** **Dashboard dedup rewire lives in the client, not in a view.** Option A was a Postgres view (`active_listings_deduped` or similar) that pre-joins `listings` ↔ `canonical_vehicles` and picks a representative per canonical, so the dashboard could keep its current single-table query. Option B (chosen) does the grouping client-side in a `useMemo` after fetching the raw `listings` rows with `canonical_vehicle_id` added to the SELECT. Chose B because: (1) the dashboard fetches ≤1k rows per market/class; grouping 1k rows into ~300–900 units is sub-millisecond JS and keeps the DB path unchanged; (2) a view locks in one "pick representative" rule (e.g. `primary_listing_id`), but the dashboard wants a different rule than analytics queries will want — most-reviewed listing as the comp-table face, vs. rate-mean across members for the metric cards, vs. whichever-is-cheaper for the future Benchmark feature. Each consumer can pick its own rule without fighting a shared view; (3) the cross-listing UI (both platform badges, `×N cross-listed` indicator, per-member external links) needs the full member array per group, which a view can only deliver via `array_agg`, which is awkward to type through PostgREST. A view becomes worthwhile the day two independent pages (Benchmark, public market pages) both need the same dedup shape; until then the client-side helper stays colocated with the one consumer.
