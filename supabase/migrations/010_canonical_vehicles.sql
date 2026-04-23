-- ────────────────────────────────────────────────────────────────────────────
-- Migration 010 — canonical_vehicles + canonical_vehicle_id FK + promotion SPI
-- ────────────────────────────────────────────────────────────────────────────
--
-- Purpose
--   Turn the audit rows in `candidate_duplicates` (migrations 007–009) into
--   a usable identity layer. A `canonical_vehicle` is one physical RV that has
--   been observed on ≥2 platforms. `listings.canonical_vehicle_id` points each
--   per-platform row at its canonical parent; singletons keep the column NULL.
--
-- Design
--   Re-derivable — every time the SPI runs for a market it drops the prior
--   canonical rows and re-computes from the current audit + verdict state.
--   Nothing about a canonical_vehicle row is authoritative beyond "this was
--   the SPI's output last time it ran." Tightening / loosening thresholds is
--   therefore a re-run, not a migration.
--
--   Dashboard pattern — every market-size aggregate becomes:
--     COUNT(DISTINCT COALESCE(canonical_vehicle_id::text, id::text))
--   A listing with no canonical row falls through to its own id, so the
--   metric works correctly whether dedup has run for that market or not.
--
--   Eligible edges for promotion:
--     (confidence = 'high' AND COALESCE(reviewer_verdict,'') != 'not_match')
--     OR reviewer_verdict = 'match'
--   This lets a reviewer (a) veto an auto-linked HIGH pair that turned out to
--   be wrong and (b) promote a MEDIUM/LOW pair that the SPI missed.
--
-- Run this in the Supabase SQL editor. Safe to re-run.

-- ── 1. canonical_vehicles table ─────────────────────────────────────────────
-- One row per merged cross-platform RV. Denormalized attributes come from the
-- `primary_listing_id` listing at promotion time; if that listing disappears
-- (RV removed from all platforms), the canonical row survives as historical
-- identity until the next full promotion run.
create table if not exists public.canonical_vehicles (
  id                  uuid         primary key default gen_random_uuid(),
  market              text         not null,

  -- The listing whose attributes populate the denormalized fields below.
  -- Usually the one with the most-complete record; the SPI picks the one
  -- with the longest primary_image_url as a cheap "has the best data" proxy.
  primary_listing_id  uuid         references public.listings(id) on delete set null,

  -- Denormalized attribute bundle — cheap joins for dashboard/kNN.
  rv_year             integer,
  rv_make             text,        -- raw from primary listing, NOT normalized
  rv_make_normalized  text,        -- through normalize_make()
  rv_model            text,
  rv_class            text,
  length_ft           numeric,
  sleeps              integer,

  -- Cross-platform bookkeeping.
  platforms           text[]       not null,   -- e.g. ARRAY['outdoorsy','rvshare']
  listing_count       integer      not null,   -- total listings merged into this canonical
  listing_ids         uuid[]       not null,   -- full membership (denormalized for fast lookup)

  -- Provenance — distinguishes SPI-promoted from reviewer-forced canonicals.
  --   'auto_high'      — every edge was confidence='high' with no 'not_match' verdict
  --   'reviewer_match' — at least one edge in the component was a reviewer verdict
  --   'mixed'          — both of the above (the component has auto HIGH edges and
  --                      at least one reviewer_match edge)
  source              text         not null check (source in ('auto_high', 'reviewer_match', 'mixed')),

  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

create index if not exists canonical_vehicles_market_idx
  on public.canonical_vehicles (market);

create index if not exists canonical_vehicles_class_idx
  on public.canonical_vehicles (market, rv_class);

-- Anon-readable in parity with listings (migration 004). When Tier 2 ships
-- (server-rendered dashboard) this policy drops along with listings_anon_read.
alter table public.canonical_vehicles enable row level security;

drop policy if exists "canonical_vehicles_anon_read" on public.canonical_vehicles;
create policy "canonical_vehicles_anon_read"
  on public.canonical_vehicles
  for select
  to anon, authenticated
  using (true);

-- ── 2. listings.canonical_vehicle_id ───────────────────────────────────────
alter table public.listings
  add column if not exists canonical_vehicle_id uuid
    references public.canonical_vehicles(id) on delete set null;

create index if not exists listings_canonical_vehicle_id_idx
  on public.listings (canonical_vehicle_id)
  where canonical_vehicle_id is not null;

-- ── 3. Promotion SPI ───────────────────────────────────────────────────────
-- Usage (from service role):
--   select * from public.promote_candidates_to_canonical('san-diego-ca');
--
-- Behavior
--   1. Clears listings.canonical_vehicle_id for the market.
--   2. Deletes all canonical_vehicles for the market.
--   3. Collects eligible edges from candidate_duplicates (see "Eligible edges"
--      in the file header). Each edge is materialized in both directions so
--      the recursive traversal can hop either way.
--   4. For each unvisited node, does a single-source breadth-first traversal
--      via recursive CTE to enumerate its connected component.
--   5. Picks a representative listing per component (longest primary_image_url
--      as a proxy for "most complete record"), inserts one canonical_vehicles
--      row, stamps every component member's canonical_vehicle_id.
--   6. Returns (canonical_count, listings_linked).
--
-- Idempotent — safe to re-run after new verdicts arrive or after a new
-- `detect_duplicate_candidates` pass retunes confidence tiers.
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
  -- ── Reset prior state for this market ─────────────────────────────────────
  update public.listings
    set canonical_vehicle_id = null
    where market = p_market
      and canonical_vehicle_id is not null;

  delete from public.canonical_vehicles
    where market = p_market;

  -- ── Materialize eligible edges (both directions) ──────────────────────────
  -- "Undirected" is the right mental model — we need to traverse from either
  -- endpoint to the other during BFS. The canonical pair ordering in
  -- candidate_duplicates (platform_a < platform_b) is irrelevant here.
  create temp table if not exists tmp_edges (
    u uuid not null,
    v uuid not null
  ) on commit drop;

  -- If the temp table survived a prior invocation in the same session, wipe it.
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

  -- ── Track visited nodes across component discovery ───────────────────────
  create temp table if not exists tmp_visited (
    node uuid primary key
  ) on commit drop;

  truncate tmp_visited;

  -- ── Iterate unvisited nodes, BFS each component ──────────────────────────
  for v_node in
    select distinct u from tmp_edges
  loop
    -- Already folded into a prior component? Skip.
    if exists (select 1 from tmp_visited where node = v_node) then
      continue;
    end if;

    -- Single-source BFS via recursive CTE. `union` (not `union all`)
    -- deduplicates, so recursion terminates when no new nodes are found.
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

    -- Record every node in this component as visited.
    insert into tmp_visited (node)
      select unnest(v_component);

    -- Pick a representative: prefer the listing with the longest
    -- primary_image_url (as a cheap proxy for "has the most populated row").
    -- Break ties by earliest first_seen_at so the choice is stable across runs.
    select id
      into v_representative
      from public.listings
      where id = any(v_component)
      order by
        length(coalesce(primary_image_url, '')) desc,
        first_seen_at asc nulls last,
        id asc
      limit 1;

    -- Determine provenance. Any reviewer_match edge in the component taints
    -- its source away from pure 'auto_high'.
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

    -- Create the canonical row.
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

    -- Stamp the FK on every component member.
    update public.listings
      set canonical_vehicle_id = v_canonical_id
      where id = any(v_component);

    v_canonical_count := v_canonical_count + 1;
    v_listings_linked := v_listings_linked + array_length(v_component, 1);
  end loop;

  return query select v_canonical_count, v_listings_linked;
end;
$$;

-- ── 4. Comments on the pg_catalog ──────────────────────────────────────────
comment on table  public.canonical_vehicles        is
  'One row per physical RV that has been detected on multiple platforms. Re-derivable from candidate_duplicates + reviewer_verdict via promote_candidates_to_canonical(market).';
comment on column public.canonical_vehicles.source is
  'auto_high = every edge was a HIGH auto-link with no not_match override. reviewer_match = at least one edge came from a reviewer promotion. mixed = both.';
comment on column public.listings.canonical_vehicle_id is
  'FK to canonical_vehicles.id. NULL = not de-duplicated (singleton) OR the promotion SPI has not been run for this market yet. Dashboard queries use COALESCE(canonical_vehicle_id, id) to count.';
comment on function public.promote_candidates_to_canonical(text) is
  'Re-derives canonical_vehicles for a market from candidate_duplicates. Clears prior state for the market first — safe to re-run after new reviewer verdicts.';
