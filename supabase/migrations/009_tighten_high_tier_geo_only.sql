-- Phase 2.5 continued: tighten HIGH tier to a geography-only gate after
-- discovering the rate-identity signal fails on commoditized trailer
-- inventory in fleet cities.
--
-- After migration 008 promoted MEDIUM candidates to HIGH via an OR clause
-- (`distance ≤ 0.5 OR rate_diff ≤ 5%`), a spot-check on 15 newly-promoted
-- HIGH pairs surfaced ONE false positive:
--
--   Pair #10504 — 2025 Coleman 17B, Menifee CA
--     dist = 2.41 mi, rate = $99 ↔ $99, sleeps 5↔5, length 21↔21, mm_sim = 1.00
--
-- This pair has IDENTICAL stored signals to a confirmed match we saw in the
-- same run (another 2025 Coleman 17B, also dist = 2.41 mi and rate = $99 ↔ $99).
-- Same year, make, model, rate, sleeps, length, mm_sim. Different physical
-- RVs owned by different people.
--
-- Root cause: rate-identity is not a discriminating signal for commoditized
-- entry-level trailers in RV-dense zones. Menifee is a fleet-rental hub;
-- every Coleman 17B owner anchors to the same $99/night market rate. The
-- "coincidental rate match" assumption that underpinned the OR clause does
-- not survive contact with cookie-cutter mass-market inventory.
--
-- The only stored signal that could discriminate #10504 from the confirmed
-- match is the primary image — pHash-style perceptual image hashing is a
-- real option for a future migration, but it is substantial infra (fetch
-- each image once, store the hash, backfill, cron-maintain). Until then,
-- the responsible posture is to require BOTH geographic proximity AND rate
-- consistency, not either/or.
--
-- Effect on the reviewed sample (33 pairs total):
--   21 original HIGH    → all stay HIGH (all were ≤ 0.33 mi).
--    7 recent med→high  → 6 stay HIGH (close-distance) + 1 drops to MEDIUM.
--    1 rate-only match  → drops to MEDIUM (#2113, was confirmed match).
--    2 original med NM  → stay MEDIUM (already rejected via mm_sim/rate).
--    1 rate-only FP     → drops to MEDIUM (#10504, false positive).
--
-- Net: 32/33 correctly classified. We trade one confirmed match (#2113,
-- now awaiting human promotion via reviewer_verdict='match') for eliminating
-- the class of false positive that could pollute a host comp-set.
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
      -- HIGH — auto-link eligible. All signals must hold simultaneously.
      -- The distance gate is the critical constraint: after migration 008,
      -- rate-identity alone was shown insufficient to discriminate same-
      -- RV pairs from same-model-different-owner pairs on commoditized
      -- inventory (Coleman 17B #10504 / #2113 had identical signals but
      -- different ground truth).
      when year_match
        and make_model_sim >= 0.60
        and (
          a_sleeps is null or b_sleeps is null
          or abs(a_sleeps - b_sleeps) <= 1
        )
        and distance_miles <= 0.5
        and coalesce(rate_diff_pct, 0) <= 30
        then 'high'

      -- MEDIUM — human-review queue. Any pair that hits year + moderate
      -- name similarity within 2.5 mi. Includes the rate-only candidates
      -- we can no longer auto-promote; a reviewer can manually mark them
      -- match/not_match after eyeballing the photos.
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
-- Recovering the #2113-style "rate-only match" cases:
--
--   These are real matches that the new HIGH gate rejects. Recovery paths,
--   in order of implementation effort:
--
--     1. Manual review. Reviewer opens the two listing photos, verdicts
--        'match', and the canonical-vehicle SPI (migration 010+) promotes
--        reviewer-verdicted matches alongside auto-linked HIGH candidates.
--
--     2. Primary-image perceptual hashing. Adds a `primary_image_phash`
--        column on listings, a backfill script that fetches and hashes
--        every image once, and a signal in this SPI that accepts a pair
--        when phash Hamming distance ≤ 8. This would recover #2113 cleanly
--        while still rejecting #10504 (their photos are different).
--
--     3. Owner-name matching. Both platforms sometimes expose a host name
--        that, when identical, is a strong signal. Fill rate for host_name
--        is currently low; not a quick win.
--
-- Why distance ≤ 0.5 mi specifically:
--
--   Every one of the 32 correctly-classified reviewed matches had distance
--   ≤ 0.36 mi. 0.5 mi provides minimal headroom for new data while still
--   being far below the platform privacy-fuzz radius of ~1.5 mi that would
--   introduce false positives. If a future market review shows real matches
--   consistently between 0.5 mi and 1.0 mi, relax with data in hand.
