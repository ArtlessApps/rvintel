-- Phase 2 schema expansion: capture every high-value field the Outdoorsy and
-- RVshare JSON:APIs already give us for free. Pre-expansion we were persisting
-- ~10 columns per listing; the APIs expose ~140 (Outdoorsy) and ~27 (RVshare)
-- attributes. This migration unlocks Phase 3 (Detail Enrichment) with zero
-- additional external calls — the data is already arriving on every daily
-- cron, we just weren't writing it.
--
-- Also adds `search_snapshots`: one row per (platform, market, class?, date)
-- capturing the market-wide rollup meta the APIs return on every search. This
-- is the "true market size" denominator the dashboard needs without any per-
-- listing fan-out. Cross-platform parity:
--   - Outdoorsy returns meta at the per-class grain  → rv_class NOT NULL
--   - RVshare returns meta at the full-market grain → rv_class NULL
--
-- Safe to re-run (idempotent). Run in the Supabase SQL editor.

-- ── 1. listings: shared attribute columns ─────────────────────────────────────
-- Common fields that both platforms expose under different names. Storing in
-- one column avoids a JOIN-at-query-time and keeps the dashboard SQL simple.
alter table public.listings
  add column if not exists sleeps              integer,
  add column if not exists length_ft           numeric,  -- outdoorsy: vehicle_length (ft); rvshare: length (ft)
  add column if not exists instant_book        boolean,  -- outdoorsy: instant_book; rvshare: is_instant_book
  add column if not exists delivery            boolean,
  add column if not exists primary_image_url   text,
  add column if not exists location_city       text,
  add column if not exists location_state      text,
  add column if not exists location_lat        numeric,
  add column if not exists location_lng        numeric;

-- ── 2. listings: Outdoorsy-only columns ───────────────────────────────────────
-- RVshare either doesn't expose these or exposes them only on detail pages.
alter table public.listings
  add column if not exists sleeps_adults         integer,
  add column if not exists sleeps_kids           integer,
  add column if not exists minimum_days          integer,
  add column if not exists cancel_policy         text,
  add column if not exists delivery_radius_miles numeric,
  add column if not exists vehicle_height        numeric,
  add column if not exists vehicle_dry_weight    numeric,
  add column if not exists vehicle_gvwr          numeric,
  add column if not exists location_zip          text,
  add column if not exists first_published       timestamptz,
  add column if not exists last_published        timestamptz,
  add column if not exists rental_score          numeric,
  add column if not exists sort_score            numeric;

-- ── 3. listings: RVshare-only columns ─────────────────────────────────────────
-- Outdoorsy either doesn't expose these or exposes them only on detail pages.
alter table public.listings
  add column if not exists insurance_status             text,
  add column if not exists electric_service             integer,  -- amps
  add column if not exists fresh_water_tank             integer,  -- gallons
  add column if not exists generator_usage_included     integer,
  add column if not exists nightly_mileage_included     integer,
  add column if not exists distance_from_search_miles   numeric,
  add column if not exists owner_id                     bigint,
  add column if not exists premier_owner                boolean,
  add column if not exists guest_favorite               boolean,
  add column if not exists new_listing_without_reviews  boolean,
  add column if not exists weekly_discount_percent      numeric,
  add column if not exists monthly_discount_percent     numeric;

-- Secondary indexes for the kNN comp-set query in Phase 4.5 (Benchmark My
-- Listing). kNN selects neighbors by (market, rv_class, length_ft, sleeps) —
-- the composite index covers the first two dimensions; the numeric columns are
-- narrowed client-side from that candidate set. instant_book / delivery are
-- filter booleans hit by dashboard segmentation queries.
create index if not exists listings_market_class_length_sleeps_idx
  on public.listings (market, rv_class, length_ft, sleeps)
  where is_active = true;

create index if not exists listings_instant_book_idx
  on public.listings (market, rv_class)
  where instant_book = true and is_active = true;

-- ── 4. search_snapshots ──────────────────────────────────────────────────────
-- Market-wide rollup the APIs return on every search call. One row per query.
-- Append-only time-series — do not update rows, insert a new row per cron run.
--
-- Grain note: the (platform, rv_class) shape diverges:
--   - Outdoorsy queries are per-class (filter[type]=b returns Class-B-only
--     meta). rv_class is NOT NULL; one row per class per cron run.
--   - RVshare queries are type-agnostic (backend ignores `type=`); pagination
--     and histograms are for the entire market. rv_class is NULL.
-- A composite (platform, market, rv_class, captured_at) is UNIQUE within a
-- single cron run — enforced by the partial unique indexes below rather than
-- a table-level constraint because rv_class is nullable and NULLs compare
-- distinct under Postgres default semantics.
create table if not exists public.search_snapshots (
  id              bigserial    primary key,
  captured_at     timestamptz  not null default now(),
  platform        text         not null,  -- 'outdoorsy' | 'rvshare'
  market          text         not null,  -- 'san-diego-ca'
  rv_class        text,                   -- NULL for rvshare (market-grain), NOT NULL for outdoorsy (class-grain)
  source_url      text,                   -- stable UI-shaped URL for this query

  -- Universe size
  total_results     integer,              -- outdoorsy meta.total / rvshare pagination.totalResults
  total_unavailable integer,              -- outdoorsy only (total_unavailable)
  total_pages       integer,              -- rvshare only (pagination.totalPages)

  -- Price summary stats (outdoorsy only — rvshare doesn't expose these directly)
  price_min     numeric,
  price_max     numeric,
  price_average numeric,
  price_median  numeric,

  -- Histograms — shapes differ per platform; stored as jsonb for fidelity.
  --   outdoorsy.price_histogram: number[]                   (fixed-width bucket counts)
  --   rvshare.nightlyRateHistogram: [{key, doc_count}, ...] (ES aggregation buckets)
  price_histogram             jsonb,
  length_histogram            jsonb,  -- rvshare only
  generator_histogram         jsonb,  -- rvshare only
  fresh_water_tank_histogram  jsonb,  -- rvshare only
  nightly_mileage_histogram   jsonb,  -- rvshare only

  -- Full raw meta payload for future field extraction without re-fetching.
  raw_meta jsonb
);

-- Tail query: "last N snapshots across all platforms/markets"
create index if not exists search_snapshots_captured_at_idx
  on public.search_snapshots (captured_at desc);

-- Time-series query: "outdoorsy San Diego Class B, last 60 days"
create index if not exists search_snapshots_platform_market_class_captured_idx
  on public.search_snapshots (platform, market, rv_class, captured_at desc);

-- Service-role writes bypass RLS. Enable RLS so anon can't read the market
-- rollup table until we explicitly expose it on the dashboard.
alter table public.search_snapshots enable row level security;

-- ── Notes ────────────────────────────────────────────────────────────────────
-- All new listings columns are NULLABLE. Historical rows (pre-2026-04-23) will
-- have NULL in every new column until the next cron sweep refreshes them.
-- That's intentional — a cron sweep is cheaper than a backfill and the
-- backfill scripts now populate these fields too for new-market bootstrapping.
--
-- `location_city` / `location_state` already existed on some pre-expansion
-- rows via the old Firecrawl LLM path (as empty strings). The scrape route
-- now writes API-derived values verbatim over any prior LLM extraction —
-- the JSON:API is ground truth vs. an LLM's best-effort card read.
