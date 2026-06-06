-- Migration 012 — Geo-based markets
-- Market becomes a query over listing coordinates, not a stored ownership column.
-- Safe to re-run (idempotent).

-- ── 1. markets table ─────────────────────────────────────────────────────────
create table if not exists public.markets (
  market_slug        text primary key,
  display_name       text not null,
  center_lat         numeric not null,
  center_lng         numeric not null,
  radius_miles       numeric not null default 30,
  outdoorsy_address  text,
  rvshare_location   text,
  region             text not null default 'Other',
  sort_order         integer not null default 0,
  is_live            boolean not null default true,
  created_at         timestamptz not null default now()
);

alter table public.markets enable row level security;

drop policy if exists "markets_anon_read" on public.markets;
create policy "markets_anon_read"
  on public.markets for select
  to anon, authenticated
  using (true);

-- ── 2. Rename listings.market → discovery_source ─────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listings' and column_name = 'market'
  ) then
    alter table public.listings rename column market to discovery_source;
  end if;
end $$;

comment on column public.listings.discovery_source is
  'Which discovery cron last touched this row (observability only). Dashboard queries use listings_in_market() geo filter, not this column.';

-- ── 3. Replace market-scoped indexes with geo-friendly indexes ───────────────
drop index if exists public.listings_market_class_fresh_idx;
drop index if exists public.listings_market_class_length_sleeps_idx;
drop index if exists public.listings_platform_class_fresh_idx;

create index if not exists listings_class_active_fresh_idx
  on public.listings (rv_class, is_active, scraped_at desc);

create index if not exists listings_geo_bbox_idx
  on public.listings (location_lat, location_lng)
  where is_active = true and location_lat is not null and location_lng is not null;

-- ── 4. Geo query helpers ─────────────────────────────────────────────────────
create or replace function public.listing_ids_in_geo_market(p_market_slug text)
returns setof uuid
language sql
stable
as $$
  select l.id
  from public.listings l
  join public.markets m on m.market_slug = p_market_slug
  where l.location_lat is not null
    and l.location_lng is not null
    and public.haversine_miles(
      l.location_lat, l.location_lng, m.center_lat, m.center_lng
    ) <= m.radius_miles
$$;

create or replace function public.listings_in_market(
  p_market_slug text,
  p_rv_class text default null,
  p_active_only boolean default true
)
returns setof public.listings
language sql
stable
as $$
  select l.*
  from public.listings l
  join public.markets m on m.market_slug = p_market_slug
  where l.location_lat is not null
    and l.location_lng is not null
    and public.haversine_miles(
      l.location_lat, l.location_lng, m.center_lat, m.center_lng
    ) <= m.radius_miles
    and (not p_active_only or l.is_active = true)
    and (p_rv_class is null or l.rv_class = p_rv_class)
  order by l.nightly_rate desc nulls last
$$;

grant execute on function public.listing_ids_in_geo_market(text) to anon, authenticated, service_role;
grant execute on function public.listings_in_market(text, text, boolean) to anon, authenticated, service_role;

comment on function public.listings_in_market is
  'Returns listings whose coordinates fall within the geo window for market_slug. Replaces WHERE discovery_source = slug.';

-- ── 5. Seed markets (generated from lib/markets.ts) ──────────────────────────
insert into public.markets (
  market_slug, display_name, center_lat, center_lng, radius_miles,
  outdoorsy_address, rvshare_location, region, sort_order, is_live
) values
  ('san-diego-ca', 'San Diego, CA', 32.7157, -117.1611, 35, 'San Diego, CA', 'san diego ca', 'California', 10, true),
  ('riverside-county-ca', 'Riverside County, CA', 33.9533, -117.3962, 45, 'Riverside County, CA', 'riverside county ca', 'California', 20, true),
  ('portland-or', 'Portland, OR', 45.5152, -122.6784, 35, 'Portland, OR', 'portland or', 'Pacific Northwest', 30, true),
  ('arklatex', 'ArkLaTex', 32.5252, -93.7502, 50, 'Shreveport, LA', 'shreveport la', 'Southwest', 40, true),
  ('los-angeles-ca', 'Los Angeles, CA', 34.0522, -118.2437, 40, 'Los Angeles, CA', 'los angeles ca', 'California', 50, true),
  ('long-beach-ca', 'Long Beach, CA', 33.7701, -118.1937, 25, null, null, 'California', 55, true),
  ('sacramento-ca', 'Sacramento, CA', 38.5816, -121.4944, 35, 'Sacramento, CA', 'sacramento ca', 'California', 60, true),
  ('san-francisco-ca', 'San Francisco, CA', 37.7749, -122.4194, 35, 'San Francisco, CA', 'san francisco ca', 'California', 70, true),
  ('san-jose-ca', 'San Jose, CA', 37.3382, -121.8863, 30, null, null, 'California', 75, true),
  ('denver-co', 'Denver, CO', 39.7392, -104.9903, 40, 'Denver, CO', 'denver co', 'Mountain West', 100, true),
  ('salt-lake-city-ut', 'Salt Lake City, UT', 40.7608, -111.891, 35, 'Salt Lake City, UT', 'salt lake city ut', 'Mountain West', 110, true),
  ('reno-nv', 'Reno, NV', 39.5296, -119.8138, 35, 'Reno, NV', 'reno nv', 'Mountain West', 120, true),
  ('cheyenne-wy', 'Cheyenne, WY', 41.14, -104.8202, 40, 'Cheyenne, WY', 'cheyenne wy', 'Mountain West', 130, true),
  ('phoenix-az', 'Phoenix, AZ', 33.4484, -112.074, 45, 'Phoenix, AZ', 'phoenix az', 'Southwest', 200, true),
  ('austin-tx', 'Austin, TX', 30.2672, -97.7431, 35, 'Austin, TX', 'austin tx', 'Southwest', 210, true),
  ('san-antonio-tx', 'San Antonio, TX', 29.4241, -98.4936, 35, 'San Antonio, TX', 'san antonio tx', 'Southwest', 220, true),
  ('dallas-fort-worth-tx', 'Dallas / Fort Worth, TX', 32.7767, -96.797, 45, 'Dallas, TX', 'dallas tx', 'Southwest', 230, true),
  ('orlando-fl', 'Orlando, FL', 28.5383, -81.3792, 35, 'Orlando, FL', 'orlando fl', 'Southeast', 300, true),
  ('tampa-fl', 'Tampa, FL', 27.9506, -82.4572, 35, 'Tampa, FL', 'tampa fl', 'Southeast', 310, true),
  ('atlanta-ga', 'Atlanta, GA', 33.749, -84.388, 40, 'Atlanta, GA', 'atlanta ga', 'Southeast', 320, true),
  ('chattanooga-tn', 'Chattanooga, TN', 35.0456, -85.3097, 30, 'Chattanooga, TN', 'chattanooga tn', 'Southeast', 330, true),
  ('columbus-oh', 'Columbus, OH', 39.9612, -82.9988, 35, 'Columbus, OH', 'columbus oh', 'Midwest', 400, true),
  ('cincinnati-oh', 'Cincinnati, OH', 39.1031, -84.512, 35, 'Cincinnati, OH', 'cincinnati oh', 'Midwest', 410, true),
  ('detroit-mi', 'Detroit, MI', 42.3314, -83.0458, 35, 'Detroit, MI', 'detroit mi', 'Midwest', 420, true),
  ('grand-rapids-mi', 'Grand Rapids, MI', 42.9634, -85.6681, 30, 'Grand Rapids, MI', 'grand rapids mi', 'Midwest', 430, true),
  ('madison-wi', 'Madison, WI', 43.0731, -89.4012, 30, 'Madison, WI', 'madison wi', 'Midwest', 440, true),
  ('milwaukee-wi', 'Milwaukee, WI', 43.0389, -87.9065, 35, 'Milwaukee, WI', 'milwaukee wi', 'Midwest', 450, true),
  ('philadelphia-pa', 'Philadelphia, PA', 39.9526, -75.1652, 35, 'Philadelphia, PA', 'philadelphia pa', 'Northeast', 500, true),
  ('baltimore-md', 'Baltimore, MD', 39.2904, -76.6122, 30, 'Baltimore, MD', 'baltimore md', 'Northeast', 510, true),
  ('new-york-ny', 'New York, NY', 40.7128, -74.006, 35, 'New York, NY', 'new york ny', 'Northeast', 520, true),
  ('washington-dc', 'Washington, DC', 38.9072, -77.0369, 35, 'Washington, DC', 'washington dc', 'Northeast', 530, true),
  ('harrisburg-pa', 'Harrisburg, PA', 40.2732, -76.8867, 30, 'Harrisburg, PA', 'harrisburg pa', 'Northeast', 540, true),
  ('seattle-wa', 'Seattle, WA', 47.6062, -122.3321, 35, 'Seattle, WA', 'seattle wa', 'Pacific Northwest', 600, true)
on conflict (market_slug) do update set
  display_name = excluded.display_name,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  radius_miles = excluded.radius_miles,
  outdoorsy_address = excluded.outdoorsy_address,
  rvshare_location = excluded.rvshare_location,
  region = excluded.region,
  sort_order = excluded.sort_order,
  is_live = excluded.is_live;
