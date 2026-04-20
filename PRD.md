# RVIntel — Product Requirements Document

**Status:** Draft v1 · 2026-04-20
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
| **Discovery + pricing** | Daily | Search pages (12 listings/page) | ~80-120 Firecrawl credits | Captures URLs + current prices in one batch |
| **Enrichment** | Once per new listing | Detail pages | ~5 credits per listing | Captures length, sleeps, slides, fees, policies |
| **Calendar** | Weekly per active listing | Detail pages | ~1 credit per listing | Powers occupancy inference |

Search pages return 12 prices per fetch, so price refresh at scale is cheap. Detail pages are expensive and used only when necessary.

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
| JSON extraction | 5 | 60-90s |
| Stealth proxy | 5× multiplier | 40-60s |

JSON extraction dominates cost. Stealth is required for Outdoorsy; RVshare works without it.

**Steady-state budget at daily cadence (San Diego only):**
- RVshare: 8 targets × 1 page × 5 credits = **40/day**
- Outdoorsy: 4 targets × 1 page × 5 credits × stealth multiplier ≈ **40/day**
- Total: ~80/day × 30 = **2,400/month**

Fits within the 3,000/month Hobby allowance with ~600 headroom. New markets will require Growth tier.

### Vercel (Pro, 300s function cap)

| Cron | Target count | Worst-case duration | Status |
|---|---|---|---|
| `rvshare-1` | 4 | ~240s | Fits |
| `rvshare-2` | 4 | ~240s | Fits |
| `outdoorsy-1` | 4 | ~240s | Fits |

Three staggered crons at 6:00, 6:10, 6:20 UTC.

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

### Phase 1 — Foundation (COMPLETE 2026-04-20)
- [x] `listing_snapshots` table (time-series capture)
- [x] `first_seen_at`, `last_seen_at`, `is_active`, `enriched_at` columns
- [x] Scrape route writes snapshot row per listing per run
- [x] Dashboard shows "priced in last 7d" metric + filters `is_active = true`
- [x] Three staggered daily crons (`rvshare-1`, `rvshare-2`, `outdoorsy-1`)
- [x] Firecrawl client timeout raised to 120s to match JSON extraction latency

### Phase 2 — Diversified Discovery (Week 1, back half — accelerated)

Rationale for acceleration: every day of relevance-sorted capture bakes biased snapshots into the time-series moat (see §4.3). Bias is not fixable retroactively, so Phase 2 is pulled forward from Week 2 to days 4–7 of Week 1 — but the sort-param verification dependency is preserved so we don't burn credits on a non-functional rotation.

**Days 1–3 (in parallel with Phase 1 stabilization):** establish a default-relevance baseline
- [ ] Capture ≥3 days of default-sort snapshots across all active targets
- [x] Record the per-target URL set each day to measure variant-rotation lift later — `listing_snapshots.source_url` column added in migration `003_snapshot_source_url.sql`; every snapshot now attributes the base `MARKET_TARGETS` URL that surfaced it

**Day 3 — Sort-param verification (hard dependency, ~20 credits)**
- [ ] One-off Firecrawl test: fetch one Outdoorsy and one RVshare search URL with `sort=price_asc` vs. default
- [ ] Diff the returned listing URL sets
- [ ] If the URL sets differ → platforms honor server-side sort → proceed to day 4 rollout
- [ ] If identical → sorting is client-side JS; fall back to price-band stratification (`price<150`, `150-300`, `300+`) and re-test

**Days 4–5 — Single-target pilot**
- [ ] Refactor `MARKET_TARGETS` from hardcoded URL strings to a structured shape — `{ platform, class, sort?, price_band?, url }` — so variants compose cleanly and cron runs can log structured dimensions alongside the raw URL. `listing_snapshots.source_url` remains the ground truth of what was fetched; the structured config is for readability, iteration, and future analytics joins.
- [ ] Add `sort` and `price_band` dimensions to `MARKET_TARGETS` using the new shape
- [ ] Ship variant rotation behind a per-target flag on **one** target first (lowest-risk: RVshare, no stealth)
- [ ] Cron picks a variant per run based on day-of-week
- [ ] Measure URL-set diversification vs. the days 1–3 baseline via `listing_snapshots.source_url`

**Days 6–7 — Fan-out**
- [ ] Enable variant rotation on all targets once pilot shows ≥15% new-URL lift vs. baseline
- [ ] Monitor credit consumption daily against the 3,000/mo Hobby ceiling
- [ ] Success metric: 7-day coverage reaches ≥90% of estimated market size

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
- **Firecrawl rate limits.** Hobby tier silently queues over rate limit → client timeouts → wasted credits. Mitigated by `MAX_PAGES: 1` and 120s client timeout. Moves to Growth once beyond SD.
- **Platform bot protection.** Outdoorsy already requires stealth proxy. RVshare could add similar. Fallback is ScrapingBee or Bright Data.
- **LLM extraction drift.** Firecrawl's JSON extraction latency varies with their model provider load. 120s timeout absorbs most variance.
- **Occupancy inference accuracy.** Calendar diffs assume "available → booked" means "booked" — but hosts also block dates manually. Need to validate against 1-2 known-booked listings.

### Product risks
- **Coverage ≠ value.** Users must understand a 150-listing sample is a feature, not a limitation. Messaging is "rigorous methodology," not "incomplete data."
- **Time-series patience.** Comp-sets need ≥60 days of snapshots to be interesting. Launch messaging must manage expectations during bootstrap.
- **Competitive moat.** Once the time-series depth exists, a copycat is 60+ days behind. Moving fast on expansion is the best defense.

### Open questions
- Do Outdoorsy and RVshare respect server-side `sort` params, or is sorting client-side JS? (Verify in Phase 2.)
- Is there a legal ceiling on scrape volume per platform? (Monitor; rotate request shape.)
- When does fleet-tier pricing make sense to launch? (Gate on having ≥30 days of trend data + occupancy.)

---

## 11. Decisions log

- **2026-04-20:** Chose **diversified-query discovery** over rotating page offsets. Offset rotation assumed stable global sort; platforms use relevance-weighted sorts that shuffle daily, producing biased samples regardless of pagination depth.
- **2026-04-20:** Chose **search-page pricing refresh** over detail-page refresh. Search returns 12 prices per fetch at 5 credits; detail returns 1 price per fetch at 5 credits. 12× cost difference for identical data.
- **2026-04-20:** Chose **single 120s Firecrawl timeout** over per-platform timeouts. LLM extraction is the slow step on both platforms; a too-tight timeout wastes successful Firecrawl responses and credits.
- **2026-04-20:** Deferred **Firecrawl Growth upgrade** until multi-market expansion. Hobby 3k credits/mo fits single-market daily cadence with ~600 headroom.
- **2026-04-20:** **RVezy** and **RVnGO** deferred to Phase 6; **Motorhome Republic** and **Campanda** excluded permanently (fleet/dealer pricing, not P2P).
- **2026-04-20:** **Pulled Phase 2 (Diversified Discovery) from Week 2 into the back half of Week 1.** Relevance-sorted capture produces biased snapshots, and principle 4.3 makes that bias permanent — every day of delay corrupts the time-series moat we cannot backfill. Acceleration preserves the sort-param verification dependency (day 3) and adds a days 1–3 default-sort baseline so variant lift is measurable rather than assumed.
- **2026-04-20:** **Shipped Tier 1 dashboard gate (passcode splash) instead of full auth.** The dashboard had no access control — a public URL serving what will eventually be a paid product. Tier 1 (middleware + shared passcode) closes the visibility gap in an hour without committing to a provider, session model, or RLS rewrite before there is a logged-in feature to justify them. Tiers 2 and 3 are staged to trigger at Phase 4 (comp-sets) and paid-tier launch respectively, so each layer of auth cost buys a concrete user-facing capability rather than speculative infrastructure.
