-- Migration 016 — Add Minneapolis, MN and Hartford, CT geo markets
-- Safe to re-run (upsert on market_slug).

insert into public.markets (
  market_slug, display_name, center_lat, center_lng, radius_miles,
  outdoorsy_address, rvshare_location, region, sort_order, is_live
) values
  (
    'minneapolis-mn',
    'Minneapolis, MN',
    44.9778,
    -93.2650,
    40,
    'Minneapolis, MN',
    'minneapolis mn',
    'Midwest',
    460,
    true
  ),
  (
    'hartford-ct',
    'Hartford, CT',
    41.7658,
    -72.6734,
    35,
    'Hartford, CT',
    'hartford ct',
    'Northeast',
    550,
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
