-- Migration 013 — Geo-scoped duplicate detection and canonical promotion
-- Pairs are drawn from listings within the market geo window, not discovery_source.

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

  with market_listings as (
    select l.*
    from public.listings l
    join public.markets m on m.market_slug = p_market
    where l.is_active = true
      and l.location_lat is not null
      and l.location_lng is not null
      and public.haversine_miles(
        l.location_lat, l.location_lng, m.center_lat, m.center_lng
      ) <= m.radius_miles
  ),
  pairs as (
    select
      a.id                                            as a_id,
      b.id                                            as b_id,
      a.platform                                      as a_platform,
      b.platform                                      as b_platform,
      p_market                                        as market,
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
    from market_listings a
    join market_listings b
      on a.platform < b.platform
      and a.id < b.id
      and public.haversine_miles(
            a.location_lat, a.location_lng,
            b.location_lat, b.location_lng
          ) <= p_geo_threshold_miles
      and (not p_year_exact
           or (a.rv_year is not null
               and b.rv_year is not null
               and a.rv_year = b.rv_year))
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
        and (
          a_sleeps is null or b_sleeps is null
          or abs(a_sleeps - b_sleeps) <= 1
        )
        and distance_miles <= 0.5
        and coalesce(rate_diff_pct, 0) <= 30
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

create or replace function public.promote_candidates_to_canonical(
  p_market text
)
returns table(canonical_count integer, listings_linked integer)
language plpgsql
as $$
declare
  v_node            uuid;
  v_component       uuid[];
  v_representative  uuid;
  v_canonical_id    uuid;
  v_canonical_count integer := 0;
  v_listings_linked integer := 0;
  v_source          text;
begin
  update public.listings
    set canonical_vehicle_id = null
    where id in (select public.listing_ids_in_geo_market(p_market))
      and canonical_vehicle_id is not null;

  delete from public.canonical_vehicles
    where market = p_market;

  create temp table if not exists tmp_edges (
    u uuid not null,
    v uuid not null
  ) on commit drop;

  truncate tmp_edges;

  insert into tmp_edges (u, v)
    select listing_a_id, listing_b_id
      from public.candidate_duplicates
      where market = p_market
        and (
          (confidence = 'high' and coalesce(reviewer_verdict, '') <> 'not_match')
          or reviewer_verdict = 'match'
        )
    union
    select listing_b_id, listing_a_id
      from public.candidate_duplicates
      where market = p_market
        and (
          (confidence = 'high' and coalesce(reviewer_verdict, '') <> 'not_match')
          or reviewer_verdict = 'match'
        );

  create index if not exists tmp_edges_u_idx on tmp_edges (u);

  create temp table if not exists tmp_visited (
    node uuid primary key
  ) on commit drop;

  truncate tmp_visited;

  for v_node in
    select distinct u from tmp_edges
  loop
    if exists (select 1 from tmp_visited where node = v_node) then
      continue;
    end if;

    with recursive reach (node) as (
      select v_node
      union
      select e.v
        from tmp_edges e
        join reach r on e.u = r.node
    )
    select array_agg(distinct node)
      into v_component
      from reach;

    insert into tmp_visited (node)
      select unnest(v_component);

    select id
      into v_representative
      from public.listings
      where id = any(v_component)
      order by
        length(coalesce(primary_image_url, '')) desc,
        first_seen_at asc nulls last,
        id asc
      limit 1;

    select
      case
        when bool_or(reviewer_verdict = 'match')
         and bool_or(confidence = 'high' and coalesce(reviewer_verdict,'') <> 'not_match')
          then 'mixed'
        when bool_or(reviewer_verdict = 'match')
          then 'reviewer_match'
        else 'auto_high'
      end
      into v_source
      from public.candidate_duplicates
      where market = p_market
        and (listing_a_id = any(v_component) or listing_b_id = any(v_component))
        and (
          (confidence = 'high' and coalesce(reviewer_verdict, '') <> 'not_match')
          or reviewer_verdict = 'match'
        );

    insert into public.canonical_vehicles (
      market,
      primary_listing_id,
      rv_year, rv_make, rv_make_normalized, rv_model, rv_class,
      length_ft, sleeps,
      platforms, listing_count, listing_ids,
      source
    )
    select
      p_market,
      l.id,
      l.rv_year, l.rv_make, public.normalize_make(l.rv_make), l.rv_model, l.rv_class,
      l.length_ft, l.sleeps,
      (select array_agg(distinct platform order by platform)
         from public.listings
         where id = any(v_component)),
      array_length(v_component, 1),
      v_component,
      v_source
    from public.listings l
    where l.id = v_representative
    returning id into v_canonical_id;

    update public.listings
      set canonical_vehicle_id = v_canonical_id
      where id = any(v_component);

    v_canonical_count := v_canonical_count + 1;
    v_listings_linked := v_listings_linked + array_length(v_component, 1);
  end loop;

  return query select v_canonical_count, v_listings_linked;
end;
$$;
