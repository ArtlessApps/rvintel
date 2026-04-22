# RVIntel — Product Requirements Document

**Status:** Draft v1.2 · 2026-04-22
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
Search-page aggregates get us to parity with "any competitor could scrape this." Detail-page attributes (length, sleeps, slides, delivery, fees) plus availability calendars unlock comp-sets and occupancy inference — the two features that justify a paid subscription.

---

## 5. Architecture

Four-layer data model, built in order:

```
┌─────────────────────────────────────────────────────┐
│ 4. Comp-Set Engine (premium)                         │
│    kNN on attributes → query snapshots for the set   │
├─────────────────────────────────────────────────────┤
│ 3. Aggregations (current dashboard)                  │
│    Market × class rollups; distribution charts       │
├─────────────────────────────────────────────────────┤
│ 2. Snapshots (time-series moat)                      │
│    listing_snapshots — append-only per scrape        │
│    availability_snapshots — weekly calendars         │
├─────────────────────────────────────────────────────┤
│ 1. Registry                                          │
│    listings — one row per listing_url                │
│    slow-changing attributes filled by /api/enrich    │
└─────────────────────────────────────────────────────┘
```

### 5.1 Data capture strategy

Three distinct scrape jobs with different cadences and costs:

| Job | Cadence | Source | Cost per run | Purpose |
|---|---|---|---|---|
| **Discovery + pricing — Outdoorsy** | Daily | `search.outdoorsy.com/rentals` JSON:API | **$0** (direct fetch, no Firecrawl) | Captures **full** URLs + current prices + 140 attributes per listing |
| **Discovery + pricing — RVshare** | Daily | Search pages via Firecrawl (LLM extraction) | ~40 Firecrawl credits | Captures URLs + current prices |
| **Enrichment** | Once per new listing | Detail pages | ~5 credits per listing | Captures length, sleeps, slides, fees, policies (Outdoorsy enrichment is free — delivered by the same search API response) |
| **Calendar** | Weekly per active listing | Detail pages | ~1 credit per listing | Powers occupancy inference |

Outdoorsy moved to direct JSON:API on 2026-04-22 (see §11). One API call returns 24 fully structured listings with 140 attributes each, bypassing the LLM extraction that previously dominated cost and latency. RVshare still uses Firecrawl markdown+LLM until its internal API (if any) is discovered.

### 5.2 Diversified discovery (Phase 2)

To avoid bias from platforms' relevance-sorted defaults, discovery rotates query shape across days:
- `sort=price_asc`, `sort=price_desc`, `sort=newest`, `sort=most_reviewed`
- Or price-band stratification: `price<150`, `150-300`, `300+`

A week of daily runs with rotating variants gives a representative census without ever paginating deeply.

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

JSON extraction dominates cost **and latency** — for RVshare. Outdoorsy no longer uses Firecrawl as of 2026-04-22; the direct JSON:API approach makes the two-tier scrape architecture moot for that platform. See §11 (2026-04-22) for the full pivot.

**Steady-state budget at daily cadence (San Diego only):**
- RVshare: 8 targets × 1 page × 5 credits = **40/day**
- Outdoorsy: direct API calls, **0 credits/day** (~70 HTTPS requests totaling ~15s end-to-end)
- Total: **40/day × 30 = 1,200/month**

Fits within the 3,000/month Hobby allowance with ~1,800 headroom — enough to add a second market (e.g. Los Angeles) on RVshare without upgrading tier. Outdoorsy multi-market expansion is effectively free until RVshare catches up.

### Vercel (Pro, 300s function cap)

| Cron | Target count | Worst-case duration | Status |
|---|---|---|---|
| `rvshare-1` | 4 | ~240s | Fits |
| `rvshare-2` | 4 | ~240s | Fits |
| `outdoorsy-1` (classes `b`, `a`) | 2 classes → ~23 API pages | ~30s | Fits |
| `outdoorsy-2` (classes `c`, `trailer`) | 2 classes → ~47 API pages | ~60s | Fits |

Four staggered crons at 6:00, 6:10, 6:20, 7:00 UTC. The Outdoorsy split (2026-04-21) originally spaced Firecrawl batches ~40 min apart to dodge stealth-proxy IP reuse; after the 2026-04-22 pivot to direct JSON:API, the split is retained for durability (one failure does not tank the whole platform) and symmetry with RVshare rather than for bot-defense reasons. Outdoorsy cron duration is now I/O-bound, not LLM-bound, so `CALL_TIMEOUT_MS` is irrelevant for that path — a per-request 10s fetch timeout is all that's needed.

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

---

## 8. Roadmap

### Phase 1 — Foundation (COMPLETE 2026-04-20, hardened 2026-04-21, Outdoorsy re-platformed 2026-04-22)
- [x] `listing_snapshots` table (time-series capture)
- [x] `first_seen_at`, `last_seen_at`, `is_active`, `enriched_at` columns
- [x] Scrape route writes snapshot row per listing per run
- [x] Dashboard shows "priced in last 7d" metric + filters `is_active = true`
- [x] Staggered daily crons — `rvshare-1`, `rvshare-2`, `outdoorsy-1`, `outdoorsy-2` (Outdoorsy split on 2026-04-21 to mitigate bot defense)
- [x] Firecrawl client timeout raised to 120s (2026-04-20), then to 180s (2026-04-21) after observing Class C LLM extractions brushing 120s
- [x] Daily cron observability — `CRON_QUERIES.md` with 12 SQL queries (status, coverage, trends, triage) plus a `cron_runs` table capturing per-invocation status, duration, error arrays, and write counts
- [x] One-off Outdoorsy San Diego backfill script — `scripts/backfill_outdoorsy_sd.mjs`, standalone Node runner. **Re-written 2026-04-22** to use the direct JSON:API path instead of neighborhood-sweep markdown scraping.
- [x] **Outdoorsy internal JSON:API discovered and integrated (2026-04-22).** `search.outdoorsy.com/rentals` returns JSON:API-formatted responses with 140 attributes per listing, no Cloudflare challenge, no bot defense. Daily Outdoorsy cron no longer consumes Firecrawl credits and completes in seconds instead of minutes. See §11 (2026-04-22) for the full investigation.
- [x] **Silent bug fixed (2026-04-22):** `filter[type]=tt` (used in the old Outdoorsy UI URL) is not recognized by the backend and returns `total=0`; the correct backend enum for travel trailer is `trailer`. Under the old Firecrawl path this masked ~692 SD travel trailers from discovery. New direct-API path uses the correct codes.

### Phase 2 — Diversified Discovery (Week 1, back half — accelerated)

Rationale for acceleration: every day of relevance-sorted capture bakes biased snapshots into the time-series moat (see §4.3). Bias is not fixable retroactively, so Phase 2 is pulled forward from Week 2 to days 4–7 of Week 1 — but the sort-param verification dependency is preserved so we don't burn credits on a non-functional rotation.

**Days 1–3 (in parallel with Phase 1 stabilization):** establish a default-relevance baseline
- [ ] Capture ≥3 days of default-sort snapshots across all active targets
- [x] Record the per-target URL set each day to measure variant-rotation lift later — `listing_snapshots.source_url` column added in migration `003_snapshot_source_url.sql`; every snapshot now attributes the base `MARKET_TARGETS` URL that surfaced it

**Day 3 — Sort-param verification (COMPLETE 2026-04-21, ~30 credits spent)**
- [x] One-off Firecrawl tests on Outdoorsy Class B San Diego: `sort=price_asc`, `sort=price_desc`, `sort=newest` vs. default
- [x] **Finding:** sort params are **client-side JS only** on Outdoorsy — server returns the identical default-ranked URL set regardless of `sort=`. Server-side `sort` rotation is therefore not a viable diversification lever.
- [x] Price-band filter (`filter[price_low]` / `filter[price_high]`) tested — these **are** server-side but surface the same top-ranked listings filtered by price, not a re-ranked slice. Lift is limited.
- [x] **Pagination (`page[offset]`) tested and confirmed working on Outdoorsy.** Default sort is empirically stable within-class (offset=0 and offset=36 return disjoint URL sets; offset=24 in step of 24 gives no overlap). This contradicts the 2026-04-20 "pagination is a bias trap" assumption for stuck classes — see §11 decisions log (2026-04-21).
- [x] **Bot defense caveat:** Outdoorsy intermittently returns a poison page (`"0 RV rentals"` with 24 empty `Quick Preview` placeholders) on paginated requests when its defense is triggered. Scrapers must treat `"0 results"` as ambiguous — could be end-of-listings or a bot-block. Mitigation: serial class execution with 5s+ cool-downs between classes; retry once on empty responses; don't trust `0` from a pagination step that previously returned data.
- [ ] RVshare sort/pagination parity test — deferred; RVshare classes are fed more evenly by default sort (2026-04-21 cron runs show ~3 new per day per class), so rotation pressure is lower there.

**Days 4–5 — Outdoorsy direct API + RVshare coverage (revised 2026-04-22)**

Strategy revision (2026-04-22): the Outdoorsy coverage problem is *solved*, not improved. The direct JSON:API returns every listing for every class in one paginated loop (~15s per class) at zero credit cost. Phase 2's original "diversify to dodge relevance bias" framing no longer applies to Outdoorsy — we now get the full ranked universe every day with `meta.total` telling us exactly how many listings exist. RVshare still needs the diversification work.

- [x] **Outdoorsy: direct JSON:API client (`lib/outdoorsy-api.ts`) + replaced Outdoorsy branch of `/api/scrape`.** Fetches all pages for each class via `search.outdoorsy.com/rentals?address=…&filter[type]=…&page[limit]=24&page[offset]=N`. 100% coverage per cron run. **2026-04-22.**
- [x] **Outdoorsy: one-off backfill via direct API** — populates the full SD universe (213 Class A + 331 Class B + 411 Class C + 692 Travel Trailer + 56 Fifth Wheel ≈ 1,700 listings) in ~60s.
- [ ] **Outdoorsy: schema expansion** — capture the high-value fields the JSON:API exposes: `vehicle_length`, `vehicle_height`, `vehicle_dry_weight`, `vehicle_gvwr`, `sleeps`, `sleeps_adults`, `sleeps_kids`, `instant_book`, `minimum_days`, `cancel_policy`, `delivery`, `delivery_radius`, `primary_image_url`, `location.{city,state,lat,lng,zip}`, `first_published`, `last_published`, `rental_score`, `sort_score`. Unlocks Phase 3 enrichment for Outdoorsy with zero extra API calls.
- [ ] **Market-wide meta snapshots (`search_snapshots`)** — store `meta.total`, `meta.price_histogram`, `meta.price_median`, `meta.price_average`, `meta.price_max/min`, `meta.total_unavailable` per (platform, market, class, date). One row per query, no per-listing fan-out. Powers the "true market size" denominator on the dashboard without any additional calls.
- [ ] RVshare: refactor `MARKET_TARGETS` to structured shape `{ platform, class, sort?, price_band?, max_pages?, url }`; keep per-target logging.
- [ ] RVshare: introduce two-tier scrape path (cheap markdown+regex refresh for known URLs, LLM extraction only for new ones) — preserves credit headroom for multi-market expansion.
- [ ] RVshare: investigate whether `rvshare.com` has an equivalent internal JSON API (follow-up from the Outdoorsy discovery). If yes, same pattern replaces Firecrawl for RVshare too and daily credit consumption drops to zero for SD.

**Days 6–7 — Fan-out**
- [ ] Confirm 7-day coverage reaches **100%** of Outdoorsy SD universe (now measurable via `meta.total`). RVshare target remains ≥90% until that platform's API path is clarified.
- [ ] Monitor credit consumption daily against the 3,000/mo Hobby ceiling — expected to fall well below prior projections now that Outdoorsy is free.
- [ ] Retire the backfill script once the daily direct-API cron has run ≥3 consecutive full sweeps without regressions.

### Phase 3 — Detail Enrichment (Weeks 2-3)
- [ ] New route: `/api/enrich`
- [ ] Schema additions: `length_ft`, `sleeps`, `slides`, `fuel_type`, `delivery_radius_mi`, `delivery_per_mile_fee`, `cleaning_fee`, `min_nights`, `included_miles`, `generator`, `solar`, `pet_policy`, `photo_count`, `host_response_rate`, `host_response_time`
- [ ] Nightly cron drains oldest `enriched_at IS NULL` queue
- [ ] Banner on dashboard: "X of Y listings enriched"

### Phase 4 — Occupancy & Comp-Sets (Weeks 4-7)
- [ ] Weekly calendar scrape → `availability_snapshots`
- [ ] Materialized view: rolling 30-day occupancy inference per listing
- [ ] Comp-set UI: kNN query on attributes + time-series aggregate over the set
- [ ] Gated behind paid tier

### Phase 4.5 — Benchmark My Listing (Weeks 5-7, overlaps Phase 4)

A public-facing "paste your listing URL → get a benchmark report" tool, modeled on AirDNA's Rentalizer. Doubles as the top-of-funnel acquisition magnet for the waitlist and the highest-intent upsell surface for paid tiers: the host lands on their own report and sees exactly what they're missing.

**Input:** a single Outdoorsy or RVshare listing URL (optionally unauthenticated for the free teaser; gated for the full report).

**Pipeline:**
1. Parse URL → resolve to `listings.id` if already in registry; else one-shot `/api/enrich` to ingest it (≤5 credits, synchronous, cached 24h)
2. Pull latest snapshot for price + attributes; fall back to live scrape if `scraped_at > 48h`
3. Run the Phase 4 kNN comp-set over the listing's attributes (class, length, sleeps, delivery radius, market)
4. Compute benchmark deltas against the comp-set and the market rollup

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

| Metric | Week 1 target | Week 4 target | Quarter 1 target |
|---|---|---|---|
| Markets covered | 1 | 1 | 10 |
| Unique listings in registry | 300+ | 500+ | 15,000+ |
| % listings priced in last 7d | 70% | 90% | 95% |
| % listings enriched | 0% | 80% | 95% |
| Snapshots captured | 300 | 14,000 | 1M+ |
| Waitlist signups | 50 | 200 | 1,000 |
| Paid conversions | 0 | 10 | 50 |

---

## 10. Risks & open questions

### Technical risks
- **Firecrawl rate limits (RVshare only now).** Hobby tier silently queues over rate limit → client timeouts → wasted credits. Mitigated by `MAX_PAGES: 1`, 180s client timeout, and the 2-cron split. Outdoorsy no longer hits Firecrawl as of 2026-04-22, so RVshare is the only surface still exposed to this failure mode.
- **Outdoorsy JSON:API could be shut down or gated.** The `search.outdoorsy.com/rentals` endpoint is undocumented and required no auth as of 2026-04-22. Outdoorsy could at any time rate-limit it, require a signed header, or move search behind auth. Mitigation: (1) the Firecrawl+LLM path still works and is kept dormant in the codebase as a fallback, not deleted; (2) monitor `cron_runs` for Outdoorsy status; on three consecutive failures, flip the Outdoorsy branch back to Firecrawl without a deploy (feature flag). Long-term, if the API stays stable for 90 days, the Firecrawl fallback can be retired.
- **Platform bot protection — poison-page variant (Outdoorsy UI, observed 2026-04-21).** Still a hazard if we ever scrape `www.outdoorsy.com` again (e.g. for detail-page enrichment). The search API path does not exhibit this behavior; but any future per-listing detail-page scrape must re-encode the retry/serial/cool-down posture or inherit the hazard.
- **LLM extraction drift (RVshare only now).** Firecrawl's JSON extraction latency varies with their model provider load. 180s timeout absorbs most variance. Low priority unless RVshare's LLM pass starts consistently exceeding 180s.
- **Config hygiene.** `.env.local` currently stores some values with literal `\n` inside the quoted strings; Next.js's built-in dotenv tolerates this, but hand-rolled parsers (e.g. the backfill script's env loader) must expand-and-trim or every DB write silently 204s into the void. Tracked in Phase 5.
- **Occupancy inference accuracy.** Calendar diffs assume "available → booked" means "booked" — but hosts also block dates manually. Need to validate against 1-2 known-booked listings.

### Product risks
- **Coverage ≠ value.** Users must understand a 150-listing sample is a feature, not a limitation. Messaging is "rigorous methodology," not "incomplete data."
- **Time-series patience.** Comp-sets need ≥60 days of snapshots to be interesting. Launch messaging must manage expectations during bootstrap.
- **Competitive moat.** Once the time-series depth exists, a copycat is 60+ days behind. Moving fast on expansion is the best defense.

### Open questions
- ~~Do Outdoorsy and RVshare respect server-side `sort` params, or is sorting client-side JS?~~ **Answered 2026-04-21 for Outdoorsy:** moot after 2026-04-22 pivot — the direct JSON:API returns the canonical ranked universe; sort params on the UI are no longer on our critical path. RVshare parity test still pending.
- ~~Does the two-tier scrape architecture ship before or after Phase 2 pagination expansion?~~ **Resolved 2026-04-22:** moot for Outdoorsy (direct API obsoletes LLM extraction entirely). Still a live question for RVshare if we can't find a parallel internal API there.
- **Does RVshare have an undocumented search API equivalent to Outdoorsy's?** Same investigation method applies: inspect the search page's network calls, check for subdomains like `api.rvshare.com` / `search.rvshare.com`, probe for JSON:API response shapes. If yes, Firecrawl spend for SD drops to zero.
- Is there a legal ceiling on scrape volume per platform? (Monitor; rotate request shape; the direct-API path is lower profile than Firecrawl's headless browser, but it is still undocumented access.)
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
