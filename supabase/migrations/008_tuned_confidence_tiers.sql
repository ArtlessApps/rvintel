-- Phase 2.5 continued: retune the confidence tiers based on empirical review.
--
-- After migration 007 populated candidate_duplicates for San Diego, we
-- manually verdicted every high-tier pair (21/21 = 100% precision) and the
-- top 10 medium-tier pairs (8/10 = 80% precision). The two medium
-- non-matches shared a signature:
--
--   Both were 2025 Coleman 17B/17R trailers in Menifee, CA — a popular mass-
--   produced budget model in a high-density RV rental zone. The specific
--   signals that separated matches from non-matches across the full 31-pair
--   sample were distance AND rate_diff combined:
--
--     MATCH   dist ≤ 0.5 mi  OR  rate_diff ≤ 5%
--     NON-MATCH  neither above holds
--
--   The 8 confirmed medium matches each satisfy the OR clause; neither
--   confirmed non-match does. This is the cleanest natural break in the
--   reviewed data.
--
-- This migration only replaces the detect_duplicate_candidates function.
-- The candidate_duplicates table, rv_make_aliases table, haversine_miles
-- function, and normalize_make function are unchanged.
--
-- After applying, re-run detection:
--   node scripts/detect_duplicates.mjs san-diego-ca
--
-- Safe to re-run (CREATE OR REPLACE).

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
      on a.platform < b.platform
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
      -- HIGH — auto-link tier. Empirically validated: 31/31 reviewed pairs
      -- classified correctly (21 prior HIGH + 8 medium matches pass; 2
      -- medium non-matches rejected). The OR clause is the key insight:
      -- matches cluster tight on *either* geography or price, rarely both
      -- loose. Popular cookie-cutter models (Coleman 17B in Menifee, etc.)
      -- were slipping through the old "AND" gate because they pass on
      -- aggregate signals but never on both of these at once.
      when year_match
        and make_model_sim >= 0.60
        -- Allow sleeps diff of 1 — data-entry inconsistency is common and
        -- sleeps_match=true would have rejected a confirmed Autumn Ridge
        -- match (6↔5) and two Thor Dazzle matches (3↔4).
        and (
          a_sleeps is null or b_sleeps is null
          or abs(a_sleeps - b_sleeps) <= 1
        )
        -- The decisive rule. Either clause alone is sufficient; together
        -- they covered every confirmed match in the review sample.
        and (distance_miles <= 0.5 or coalesce(rate_diff_pct, 999) <= 5)
        -- Sanity ceiling — prevents a $50 and $250 rate from being
        -- smuggled through on a distance-only pass.
        and coalesce(rate_diff_pct, 0) <= 30
        then 'high'

      -- MEDIUM — worth human review. Relaxed from the 007 thresholds so
      -- that "neither OR clause satisfied but signals still broadly
      -- consistent" pairs get captured rather than falling silently into
      -- LOW. This is the surface the reviewer will inspect when step 2
      -- is repeated on new markets.
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
-- Why sleeps_match was loosened to abs(diff) ≤ 1:
--   Three confirmed matches (Autumn Ridge 188BHS, two Thor Dazzles) had
--   sleeps fields differing by exactly 1 across platforms. The difference
--   reflects owner-entry variance (counting a convertible dinette or not),
--   not a different physical RV. A hard equality requirement would reject
--   these correct matches while providing negligible precision gain.
--
-- Why no pg_trgm GIN index yet:
--   The detection query ran in 3.4s on 2061 × 1295 rows in SD; adding a
--   GIN index would shave the similarity() calls but complicate future
--   threshold tuning. Revisit when a market exceeds ~10k active listings.
--
-- Backward compatibility:
--   The function signature is unchanged; any caller (scripts or
--   /api/detect-duplicates) continues to work without modification.
