-- Migration 017 — Add Orange County, CA and Albuquerque, NM geo markets
-- Safe to re-run (upsert on market_slug).

insert into public.markets (
  market_slug, display_name, center_lat, center_lng, radius_miles,
  outdoorsy_address, rvshare_location, region, sort_order, is_live
) values
  (
    'orange-county-ca',
    'Orange County, CA',
    33.7175,
    -117.8311,
    30,
    'Orange County, CA',
    'orange county ca',
    'California',
    52,
    true
  ),
  (
    'albuquerque-nm',
    'Albuquerque, NM',
    35.0844,
    -106.6504,
    35,
    'Albuquerque, NM',
    'albuquerque nm',
    'Southwest',
    240,
    true
  )
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
