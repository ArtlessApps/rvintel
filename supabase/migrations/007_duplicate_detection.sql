-- Phase 2.5: Cross-platform duplicate detection (audit-only).
--
-- The same physical RV often appears on both Outdoorsy and RVshare; the
-- platforms have no shared identifier so our `listings` table today counts
-- those as two independent rows. That inflates market-size figures and lets
-- a host's own cross-listing pollute their comp-set.
--
-- This migration is the READ-ONLY detection half of the canonical-vehicle
-- program. It stands up:
--   1. pg_trgm            — fuzzy string similarity for make/model matching.
--   2. haversine_miles()  — great-circle distance so the geo filter stays
--                           intuitive (miles, not degrees²).
--   3. rv_make_aliases    — small lookup table for the handful of cases
--                           where the two platforms genuinely disagree on
--                           what the "make" is (series-vs-chassis). Seeded
--                           with the common Winnebago/Thor/Jayco/Coachmen
--                           confusions we already see in the San Diego data.
--   4. candidate_duplicates — append-only audit table. One row per likely
--                             cross-platform pair, with every signal that
--                             fed the confidence score stored alongside for
--                             the manual-review step.
--   5. detect_duplicate_candidates(market, geo_miles) — the detection SPI.
--      Clears prior rows for the market, re-runs the join, inserts fresh
--      candidates. Safe to call repeatedly.
--
-- NOTHING in this migration writes to `listings`. The canonical_vehicle_id
-- column and the canonical_vehicles table arrive in a later migration only
-- after we've measured precision on ~20-30 manually-reviewed candidates.
--
-- Geo threshold rationale: both platforms fuzz owner coordinates by 0.5-1.5
-- miles for privacy, so a "tight" match still needs ~2 miles of slack. We
-- default to 3 miles in the SPI and lean on year + make/model + rate +
-- sleeps as the precision signals. The audit table captures the distance
-- so we can tune this after reviewing the false-positive rate.
--
-- Safe to re-run (idempotent).

-- ── 1. Extensions ────────────────────────────────────────────────────────────
-- pg_trgm ships with Supabase; this is a no-op if already enabled.
create extension if not exists pg_trgm;

-- ── 2. Haversine distance ────────────────────────────────────────────────────
-- Returns miles between two (lat, lng) points. Marked immutable so the query
-- planner can cache results inside a single statement and use it in WHERE.
-- 3959 is Earth's radius in miles; switch to 6371 for km if ever needed.
create or replace function public.haversine_miles(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql
immutable
as $$
  select (3959 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians((lng2 - lng1) / 2)), 2)
  )))::numeric
$$;

-- ── 3. Make alias table ──────────────────────────────────────────────────────
-- Outdoorsy and RVshare sometimes disagree on whether the "make" is the
-- chassis manufacturer or the RV series. Examples from the San Diego data:
--
--   Outdoorsy: make="Thor",      model="Four Winds 26B"
--   RVshare:   make="Four Winds", model="26B"
--
--   Outdoorsy: make="Winnebago", model="Travato 59GL"
--   RVshare:   make="Winnebago", model="Travato 59GL"   (same — no conflict)
--
-- The trick cases are the first one: a pure string match on `rv_make` would
-- miss an obvious same-RV pair. This table maps every known series name back
-- to its canonical chassis manufacturer, so `normalize_make()` can unify
-- them. If we see `make = 'four winds'` OR `make = 'thor'` we compare as
-- 'thor' on both sides.
create table if not exists public.rv_make_aliases (
  raw_make       text primary key,  -- lowercase, trimmed
  canonical_make text not null
);

-- Seed with the series → chassis mappings we know from the DESIGN doc's
-- MAKE_MODEL_CLASS_RULES table and the first 2,000 rows of SD inventory.
-- Extending this table later is the supported way to improve recall.
insert into public.rv_make_aliases (raw_make, canonical_make) values
  -- Thor sub-brands (Class A/B/C)
  ('four winds',     'thor'),
  ('chateau',        'thor'),
  ('freedom elite',  'thor'),
  ('quantum',        'thor'),
  ('axis',           'thor'),
  ('vegas',          'thor'),
  ('sequence',       'thor'),
  ('tellaro',        'thor'),
  ('rize',           'thor'),
  ('scope',          'thor'),
  ('sanctuary',      'thor'),
  ('hurricane',      'thor'),
  ('palazzo',        'thor'),

  -- Winnebago sub-brands
  ('travato',        'winnebago'),
  ('solis',          'winnebago'),
  ('revel',          'winnebago'),
  ('ekko',           'winnebago'),
  ('boldt',          'winnebago'),
  ('era',            'winnebago'),
  ('minnie winnie',  'winnebago'),
  ('view',           'winnebago'),
  ('navion',         'winnebago'),
  ('vista',          'winnebago'),
  ('adventurer',     'winnebago'),
  ('journey',        'winnebago'),
  ('forza',          'winnebago'),

  -- Jayco sub-brands
  ('redhawk',        'jayco'),
  ('greyhawk',       'jayco'),
  ('melbourne',      'jayco'),
  ('seneca',         'jayco'),
  ('jay flight',     'jayco'),

  -- Coachmen sub-brands
  ('galleria',       'coachmen'),
  ('beyond',         'coachmen'),
  ('leprechaun',     'coachmen'),
  ('freelander',     'coachmen'),
  ('prism',          'coachmen'),

  -- Forest River sub-brands
  ('sunseeker',      'forest river'),
  ('forester',       'forest river'),
  ('rockwood',       'forest river'),
  ('flagstaff',      'forest river'),

  -- Tiffin sub-brands
  ('allegro',        'tiffin'),
  ('phaeton',        'tiffin'),

  -- Fleetwood sub-brands
  ('bounder',        'fleetwood'),
  ('pace arrow',     'fleetwood'),
  ('discovery',      'fleetwood'),

  -- Keystone sub-brands
  ('bullet',         'keystone'),
  ('hideout',        'keystone'),
  ('passport',       'keystone'),
  ('springdale',     'keystone'),
  ('montana',        'keystone'),
  ('cougar',         'keystone')
on conflict (raw_make) do nothing;

-- Normalization function. Rules:
--   1. NULL or empty input → NULL (don't invent a match).
--   2. Look up in rv_make_aliases (case/whitespace insensitive).
--   3. Otherwise return lowercased+trimmed raw string.
-- Immutable so it composes with expression indexes if we ever need one.
create or replace function public.normalize_make(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null
    else coalesce(
      (select canonical_make from public.rv_make_aliases
        where raw_make = lower(btrim(raw))),
      lower(btrim(raw))
    )
  end
$$;

-- ── 4. candidate_duplicates audit table ──────────────────────────────────────
-- Append-only (the SPI truncates per-market before re-inserting, so "append-
-- only" holds within a single market's detection lifecycle). Every signal
-- used by the confidence tier logic is stored here so a human reviewer can
-- sort, filter, and retroactively re-score without re-running the join.
--
-- Pair ordering convention: platform_a < platform_b lexicographically
-- ('outdoorsy' < 'rvshare'). The unique constraint prevents both (a,b) and
-- (b,a) being inserted for the same pair.
create table if not exists public.candidate_duplicates (
  id                bigserial    primary key,
  detected_at       timestamptz  not null default now(),

  -- Pair identity (platform_a always lex-min of the two)
  listing_a_id      uuid         not null references public.listings(id) on delete cascade,
  listing_b_id      uuid         not null references public.listings(id) on delete cascade,
  platform_a        text         not null,
  platform_b        text         not null,
  market            text         not null,

  -- Raw comparison signals (stored verbatim so reviewers can eyeball)
  year_a            integer,
  year_b            integer,
  year_match        boolean,

  make_a            text,        -- raw rv_make from listings
  make_b            text,
  make_normalized_a text,        -- through normalize_make()
  make_normalized_b text,
  make_sim          numeric,     -- trigram similarity 0..1 on raw makes

  model_a           text,
  model_b           text,
  model_sim         numeric,

  -- Combined "make model" trigram — robust to series/chassis column shuffling.
  -- This is usually the most reliable text signal.
  make_model_sim    numeric,

  distance_miles    numeric,

  rate_a            numeric,
  rate_b            numeric,
  rate_diff_pct     numeric,     -- |a-b|/max(a,b) * 100

  sleeps_a          integer,
  sleeps_b          integer,
  sleeps_match      boolean,

  length_a          numeric,
  length_b          numeric,
  length_diff_ft    numeric,

  -- Scoring output (from detect_duplicate_candidates SPI)
  confidence        text         not null check (confidence in ('high', 'medium', 'low')),

  -- Manual review state — populated by humans, not the SPI.
  reviewed          boolean      not null default false,
  reviewer_verdict  text         check (reviewer_verdict in ('match', 'not_match', 'unclear')),
  reviewer_notes    text,

  constraint candidate_duplicates_pair_uq unique (listing_a_id, listing_b_id)
);

create index if not exists candidate_duplicates_market_confidence_idx
  on public.candidate_duplicates (market, confidence, detected_at desc);

create index if not exists candidate_duplicates_reviewed_idx
  on public.candidate_duplicates (market, reviewed)
  where reviewed = false;

-- Service-role writes only; enable RLS so the anon key never sees the audit
-- data (it is internal tooling, not dashboard surface).
alter table public.candidate_duplicates enable row level security;
alter table public.rv_make_aliases enable row level security;

-- ── 5. Detection SPI ─────────────────────────────────────────────────────────
-- Usage (from service role): select public.detect_duplicate_candidates('san-diego-ca');
-- Returns the number of candidate pairs inserted.
--
-- Behavior:
--   - Deletes all existing candidate_duplicates rows for the market.
--   - Joins listings to itself, filtered to cross-platform pairs within the
--     geo threshold. Year equality is required (set p_year_exact=false to
--     relax this for QA).
--   - Computes every signal and writes one row per pair.
--   - Confidence tiers are declarative — change the CASE here and re-run
--     the SPI to re-score; no code deploy needed.
--
-- Confidence tier definitions:
--   HIGH    — year match AND make_model_sim ≥ 0.60 AND distance ≤ 2.0 mi
--             AND rate_diff ≤ 15% AND sleeps match.
--             Intent: auto-link eligible. False-positive budget: very low.
--   MEDIUM  — year match AND make_model_sim ≥ 0.35 AND distance ≤ 2.5 mi
--             AND rate_diff ≤ 30%.
--             Intent: queue for human review.
--   LOW     — everything else emitted by the join. Kept for recall analysis
--             ("are we missing real matches just below the medium line?").
create or replace function public.detect_duplicate_candidates(
  p_market             text,
  p_geo_threshold_miles numeric default 3.0,
  p_year_exact         boolean default true
) returns integer
language plpgsql
as $$
declare
  v_inserted integer;
begin
  delete from public.candidate_duplicates where market = p_market;

  with pairs as (
    select
      a.id                                            as a_id,
      b.id                                            as b_id,
      a.platform                                      as a_platform,
      b.platform                                      as b_platform,
      a.market                                        as market,
      a.rv_year                                       as a_year,
      b.rv_year                                       as b_year,
      (a.rv_year is not distinct from b.rv_year
        and a.rv_year is not null)                    as year_match,
      a.rv_make                                       as a_make,
      b.rv_make                                       as b_make,
      public.normalize_make(a.rv_make)                as a_make_n,
      public.normalize_make(b.rv_make)                as b_make_n,
      similarity(
        coalesce(lower(a.rv_make), ''),
        coalesce(lower(b.rv_make), '')
      )                                               as make_sim,
      a.rv_model                                      as a_model,
      b.rv_model                                      as b_model,
      similarity(
        coalesce(lower(a.rv_model), ''),
        coalesce(lower(b.rv_model), '')
      )                                               as model_sim,
      -- Combined signal uses NORMALIZED make (so "four winds" → "thor" on
      -- both sides) plus raw model. This absorbs the series/chassis shuffle
      -- problem without needing to normalize model strings too.
      similarity(
        coalesce(public.normalize_make(a.rv_make), '') || ' ' || coalesce(lower(a.rv_model), ''),
        coalesce(public.normalize_make(b.rv_make), '') || ' ' || coalesce(lower(b.rv_model), '')
      )                                               as make_model_sim,
      public.haversine_miles(
        a.location_lat, a.location_lng,
        b.location_lat, b.location_lng
      )                                               as distance_miles,
      a.nightly_rate                                  as a_rate,
      b.nightly_rate                                  as b_rate,
      case
        when a.nightly_rate is null or b.nightly_rate is null then null
        when greatest(a.nightly_rate, b.nightly_rate) = 0 then null
        else abs(a.nightly_rate - b.nightly_rate)
             / greatest(a.nightly_rate, b.nightly_rate) * 100
      end                                             as rate_diff_pct,
      a.sleeps                                        as a_sleeps,
      b.sleeps                                        as b_sleeps,
      (a.sleeps is not distinct from b.sleeps
        and a.sleeps is not null)                     as sleeps_match,
      a.length_ft                                     as a_length,
      b.length_ft                                     as b_length,
      case
        when a.length_ft is null or b.length_ft is null then null
        else abs(a.length_ft - b.length_ft)
      end                                             as length_diff_ft
    from public.listings a
    join public.listings b
      on a.platform < b.platform                -- cross-platform, unordered
      and a.market = b.market
      and a.is_active = true
      and b.is_active = true
      and a.location_lat is not null
      and a.location_lng is not null
      and b.location_lat is not null
      and b.location_lng is not null
      and public.haversine_miles(
            a.location_lat, a.location_lng,
            b.location_lat, b.location_lng
          ) <= p_geo_threshold_miles
      and (not p_year_exact
           or (a.rv_year is not null
               and b.rv_year is not null
               and a.rv_year = b.rv_year))
    where a.market = p_market
  )
  insert into public.candidate_duplicates (
    listing_a_id, listing_b_id, platform_a, platform_b, market,
    year_a, year_b, year_match,
    make_a, make_b, make_normalized_a, make_normalized_b, make_sim,
    model_a, model_b, model_sim, make_model_sim,
    distance_miles,
    rate_a, rate_b, rate_diff_pct,
    sleeps_a, sleeps_b, sleeps_match,
    length_a, length_b, length_diff_ft,
    confidence
  )
  select
    a_id, b_id, a_platform, b_platform, market,
    a_year, b_year, year_match,
    a_make, b_make, a_make_n, b_make_n, make_sim,
    a_model, b_model, model_sim, make_model_sim,
    distance_miles,
    a_rate, b_rate, rate_diff_pct,
    a_sleeps, b_sleeps, sleeps_match,
    a_length, b_length, length_diff_ft,
    case
      when year_match
        and make_model_sim >= 0.60
        and distance_miles <= 2.0
        and coalesce(rate_diff_pct, 999) <= 15
        and sleeps_match
        then 'high'
      when year_match
        and make_model_sim >= 0.35
        and distance_miles <= 2.5
        and coalesce(rate_diff_pct, 999) <= 30
        then 'medium'
      else 'low'
    end as confidence
  from pairs;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ── Notes ────────────────────────────────────────────────────────────────────
-- Why no canonical_vehicle_id column yet:
--   We are explicitly in detection-only mode. Adding the FK column before
--   measuring precision would tempt a dashboard change that silently depends
--   on candidate data, and any false positive would then double-count in
--   reverse (a real competitor gets hidden as "your own listing"). The
--   canonical_vehicles table + listings.canonical_vehicle_id column are
--   planned for migration 008 once we've hand-verified ≥20 high-confidence
--   pairs with a ≥95% precision read.
--
-- Why pg_trgm, not Levenshtein:
--   Trigram similarity is O(1) via the GIN index Supabase can build later;
--   Levenshtein is O(n*m) per comparison. For the ~1,500-row SD dataset the
--   difference is invisible, but a 10-market expansion (n=15k) would start
--   to feel pg_trgm's edge. The `similarity()` function is also what the
--   supabase dashboard uses for its fuzzy search, so output is comparable.
--
-- Why no `distance_miles` index:
--   The value is computed per-pair inside detect_duplicate_candidates and
--   never queried out of the audit table. If the dashboard ever surfaces
--   candidates by proximity we can add one at that time.
