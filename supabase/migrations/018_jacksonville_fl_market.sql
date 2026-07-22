-- Migration 018 — Add Jacksonville, FL geo market
-- Safe to re-run (upsert on market_slug).

insert into public.markets (
  market_slug, display_name, center_lat, center_lng, radius_miles,
  outdoorsy_address, rvshare_location, region, sort_order, is_live
) values
  (
    'jacksonville-fl',
    'Jacksonville, FL',
    30.3322,
    -81.6557,
    35,
    'Jacksonville, FL',
    'jacksonville fl',
    'Southeast',
    340,
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
