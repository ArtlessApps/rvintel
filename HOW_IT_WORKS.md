# How RVIntel Works (Behind the Scenes)

This guide explains what happens when someone uses the site or when data updates — written for readers who are new to web apps.

---

## The big picture

**RVIntel** is a **Next.js** web application. Next.js is a framework that runs **React** (a library for building interactive pages) on the server and in the browser. The app has four main "moving parts":

1. **The marketing home page** (`/`) — collects waitlist emails.
2. **The public market pages** (`/markets`, `/markets/san-diego`, `/markets/riverside-county`, …) — display PDF market reports, no login required.
3. **The market dashboard** (`/dashboard`) — shows live rental listings and charts from the database; requires a magic-link login.
4. **A background data pipeline** — nine scheduled jobs that pull listing data from Outdoorsy and RVshare and save it to the database.

Think of it as: **browser ↔ your app on Vercel ↔ Supabase (database)**, plus **scheduled jobs** that call special API routes to refresh listing data by hitting Outdoorsy and RVshare's internal JSON APIs directly.

---

## What runs where?

| Piece | Where it runs | Role |
|--------|----------------|------|
| Home page & marketing UI | In the visitor's **browser** | Buttons, forms, navigation |
| **Supabase client** (anon key) | In the **browser** | Read listings; insert waitlist rows (subject to Supabase security rules) |
| **`/api/scrape`** | On **Vercel** (server) | Fetch listings from Outdoorsy and RVshare JSON APIs, write to DB with elevated permissions |
| **`/api/sweeper`** | On **Vercel** (server) | Mark listings as inactive when they haven't been seen in 14 days |
| **`/api/detect-duplicates`** | On **Vercel** (server) | Find RVs listed on both platforms (same RV, two rows) and queue them for merging |
| **`/api/rate-history`** | On **Vercel** (server) | Aggregate historical snapshots into a daily avg-rate series |
| **Cron jobs** | **Vercel** triggers HTTP GETs on a schedule | Kick off each pipeline job automatically |
| **Vercel Analytics** | In **production** only | Anonymous usage metrics |

---

## 1. Home page — waitlist

When someone enters an email and submits:

1. The page runs JavaScript in the browser (the file is a **client component** — it starts with `"use client"`).
2. It calls **Supabase** using the **public (anon) key**. That key is safe to ship in the browser; what it can do is controlled by **Row Level Security** policies set in Supabase.
3. The code inserts a row into the **`waitlist`** table with that email.

---

## 2. Dashboard — reading market data

The dashboard requires a Supabase magic-link login (`/login`). Once authenticated:

1. The browser uses the Supabase client (anon key) to **select** rows from **`listings`** filtered by `market` and `rv_class`, sorted by nightly rate.
2. Before displaying metrics, the client deduplicates rows that share the same `canonical_vehicle_id` — these are RVs listed on both Outdoorsy and RVshare that the dedup pipeline has confirmed are the same physical vehicle. The honest-aggregate badge shows both the raw and deduped count: *"312 unique RVs (324 raw listings, 12 cross-platform dupes merged)."*
3. In parallel, it calls **`/api/rate-history`** — a server route that reads `listing_snapshots` with the service-role key (the snapshots table is RLS-protected so the browser can't read it directly) and returns a daily avg-rate series for the chosen market, class, and time window.

The **Market** dropdown currently shows **San Diego, CA** and **Riverside County, CA** — the two markets with live data pipelines.

---

## 3. Where listing data comes from — `/api/scrape`

### The direct JSON:API approach (current, zero cost)

Both Outdoorsy and RVshare expose internal JSON endpoints that return structured listing data without any scraping:

- **Outdoorsy:** `search.outdoorsy.com/rentals?address=…&filter[type]=…&page[limit]=24&page[offset]=N` — returns full JSON:API responses with 140 attributes per listing (price in cents, length, sleeps, cancel policy, delivery radius, GPS coordinates, platform ranking scores, etc.)
- **RVshare:** `rvshare.com/rv-rental.json?location=…&page=N` — returns a complete paginated listing universe with 27 attributes per listing plus five market-wide histograms (nightly rate, length, generator, water tank, mileage)

A full sweep of both platforms across both markets is ~135 HTTP requests and completes in under 90 seconds total, at zero external API cost.

### What happens each cron run

1. **Authorization** — the route checks `CRON_SECRET`. If the header matches (or if no secret is set in dev), it proceeds.
2. **Fetch** — it paginates through all pages for each market/class combination, collecting every listing.
3. **Normalize** — prices, booleans, timestamps, and class labels are cleaned. Outdoorsy prices are in cents and divided by 100. RVshare's `attributes.type` string is mapped to a standard class label (Class A, Class B, Travel Trailer, etc.).
4. **Classify** — a deterministic lookup table of known make/model → class overrides the platform's label where the platform is inconsistent (e.g. "Four Winds" is always Class C regardless of how the platform tagged it).
5. **Upsert** — rows are written to **`listings`** on `listing_url` so re-running updates prices rather than creating duplicates.
6. **Snapshots** — a `listing_snapshots` row is appended for every upserted listing, recording the rate at that point in time. This append-only time series is the core historical dataset and cannot be backfilled retroactively.
7. **Market snapshot** — one `search_snapshots` row is written per cron run per (platform, market, class), capturing platform-reported totals and price statistics. This is the source for market-size trend cards.
8. **Log** — a `cron_runs` row records the run outcome, duration, and error count.

### The Firecrawl fallback (dormant)

Before April 22, 2026, both platforms were scraped using **Firecrawl** (a service that renders pages like a browser) combined with an LLM extraction step. This was expensive (~40 Firecrawl credits/day, 60–180 seconds per run) and required a `FIRECRAWL_API_KEY`.

The Firecrawl path is still in the codebase behind two environment flags (`OUTDOORSY_SCRAPER=firecrawl`, `RVSHARE_SCRAPER=firecrawl`) as an emergency fallback in case either direct API gets gated. Under normal operation neither flag is set and Firecrawl is never called. `FIRECRAWL_API_KEY` only needs to be set if you deliberately flip a fallback on.

---

## 4. Keeping data fresh — `/api/sweeper`

Listings that disappear from the platform (delisted, removed, or taken private) are not returned by the scrape APIs, so their `last_seen_at` timestamp stops updating. The sweeper runs daily at 10:00 UTC and flips `is_active = false` on any listing whose `last_seen_at` is more than 14 days old.

The dashboard filters on `is_active = true`, so stale listings drop out of all averages and charts automatically. The sweeper covers all markets in one pass — no changes needed when a new market is added.

---

## 5. Cross-platform deduplication — `/api/detect-duplicates`

An RV listed on both Outdoorsy and RVshare exists as two rows in `listings` with no shared identifier. Without deduplication:
- Market-size counts are inflated
- Price distributions are skewed (the same RV contributes two data points)
- A host's comp-set could surface their own listing from the other platform as a "competitor"

The detection pipeline runs weekly (Sundays) and calls a Postgres stored procedure (`detect_duplicate_candidates`) that compares cross-platform pairs using GPS distance, year, make/model text similarity, sleeps count, and rate difference. Pairs that pass the HIGH-confidence threshold (within 0.5 miles, same year, make/model similarity ≥ 0.60, sleeps within 1) are auto-linked into `canonical_vehicles`. Lower-confidence pairs queue for manual review.

The dashboard deduplicates against `canonical_vehicle_id` at query time, so the merged view is always current.

---

## 6. The nine scheduled jobs

| Job | Time (UTC) | Market | What it does |
|-----|-----------|--------|--------------|
| RVshare scrape | 06:00 daily | San Diego | Full RVshare universe sweep (~65 pages) |
| Outdoorsy scrape (group 1) | 06:20 daily | San Diego | Classes A + B |
| Outdoorsy scrape (group 2) | 07:00 daily | San Diego | Classes C + Travel Trailer + Fifth Wheel |
| RVshare scrape | 08:00 daily | Riverside County | Full RVshare universe sweep |
| Outdoorsy scrape (group 1) | 08:20 daily | Riverside County | Classes A + B |
| Outdoorsy scrape (group 2) | 09:00 daily | Riverside County | Classes C + Travel Trailer + Fifth Wheel |
| Sweeper | 10:00 daily | all markets | Flip stale listings to `is_active = false` |
| Detect duplicates | 11:00 Sundays | San Diego | Cross-platform dedup candidates |
| Detect duplicates | 11:30 Sundays | Riverside County | Cross-platform dedup candidates |

All nine are defined in `vercel.json`. The scrape crons call `GET /api/scrape?platform=…&market=…`; the sweeper calls `GET /api/sweeper`; the detect-duplicates crons call `GET /api/detect-duplicates?market=…`.

---

## 7. Bootstrapping a new market

When a new market is added, the daily crons will start collecting data going forward — but the registry starts empty. To populate it immediately, run the two backfill scripts locally (they mirror the cron logic but run outside Vercel's 300s time cap):

```bash
node scripts/backfill_rvshare_<market>.mjs
node scripts/backfill_outdoorsy_<market>.mjs
```

Each script paginates the full universe, upserts all listings, writes initial snapshots, and logs to `cron_runs`. Typical runtime: 50–90 seconds.

---

## 8. Configuration secrets (`.env.local`)

| Variable | Used by | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Safe to be public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Safe to be public; what it can read is controlled by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Bypasses RLS — never put in client code or commit to git |
| `CRON_SECRET` | Server only | Prevents unauthorized scrape triggers in production |
| `FIRECRAWL_API_KEY` | Server only | Only needed if a fallback flag is flipped; not required in normal operation |

Variables prefixed with `NEXT_PUBLIC_` are embedded in client bundles — never put the service role key or cron secret there.

---

## 9. Other files you might notice

- **`components/dashboard-preview.tsx`** and hero imagery on `/` are **marketing mockups** — not wired to live data.
- **`lib/outdoorsy-api.ts`** / **`lib/rvshare-api.ts`** — the typed API clients that handle pagination, normalization, and the cents-to-dollars conversion for Outdoorsy prices.
- **`lib/supabase.ts`** — creates the Supabase client and documents TypeScript shapes for `listings`, `listing_snapshots`, `search_snapshots`, `cron_runs`, `canonical_vehicles`, `candidate_duplicates`, and `waitlist`.
- **`scripts/`** — local one-off scripts: backfills, duplicate review tooling, lead exports. Not part of the Next.js request path.
- **`supabase/migrations/`** — SQL migration files (001–010) that define the schema evolution. Run these in order against a fresh Supabase project to recreate the full schema.

---

## 10. End-to-end flow (mental model)

```text
Visitor opens /
    → Browser loads React UI
    → Submit email → Supabase waitlist (anon key + RLS)

Visitor opens /markets/san-diego
    → Static page serves PDF market report (no DB involved)

Authenticated user opens /dashboard
    → Browser queries Supabase listings (anon key + RLS)
    → Client deduplicates rows by canonical_vehicle_id
    → Browser calls /api/rate-history → server reads listing_snapshots (service role)
      → returns daily avg-rate series → chart renders

Daily (06:00 – 09:00 UTC) on Vercel — per market
    → GET /api/scrape?platform=…&market=…
    → Server: fetch Outdoorsy/RVshare JSON:API → normalize → upsert listings (service role)
    → Append listing_snapshots (time-series moat)
    → Write search_snapshots (market-size + price stats)
    → Log cron_runs row

Daily (10:00 UTC) on Vercel
    → GET /api/sweeper
    → Server: flip is_active=false where last_seen_at < now() - 14d (all markets)

Weekly (Sundays 11:00 / 11:30 UTC) on Vercel
    → GET /api/detect-duplicates?market=…
    → Server: run detect_duplicate_candidates SPI → write candidate_duplicates
    → High-confidence pairs → canonical_vehicles (auto-linked)
    → Medium pairs → reviewer queue
```

---

## Summary

- **Frontend:** Next.js + React; home page and dashboard talk to Supabase from the browser. Dashboard requires Supabase magic-link auth.
- **Data pipeline:** Two direct JSON:APIs (Outdoorsy + RVshare) fetched at zero credit cost. Firecrawl is a dormant fallback, not the primary path.
- **Scheduling:** Nine Vercel Cron jobs — six daily scrapes (two markets × three platform chunks), one daily sweeper, two weekly dedup runs.
- **Data integrity:** Append-only snapshots build the time-series moat; `is_active` lifecycle tracking keeps aggregates honest; cross-platform dedup prevents double-counting.
- **Safety:** Keep the service role key and cron secret on the server; RLS in Supabase controls what the browser key can read.

Adding a new market means: adding entries to four config maps in `/api/scrape/route.ts`, three cron entries in `vercel.json`, a page under `app/markets/`, a card on the markets index, a sitemap entry, and running the two backfill scripts. No schema changes, no new routes.
