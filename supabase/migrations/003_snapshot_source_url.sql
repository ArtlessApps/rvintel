-- Phase 2 prerequisite: per-target attribution on snapshots.
-- We need to answer "which search URL surfaced this listing on this day?" so
-- variant-rotation lift (sort=price_asc vs. default, price bands, etc.) is
-- measurable rather than assumed. The base target URL from MARKET_TARGETS is
-- the variant identity — it encodes platform, class, and any future sort
-- or price_band params. Nullable so existing snapshot rows stay valid without
-- backfill; every new snapshot from the scrape route will populate it.
--
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).

alter table public.listing_snapshots
  add column if not exists source_url text;

-- Supports lift queries: "distinct listings seen via this URL over this window".
create index if not exists listing_snapshots_source_url_captured_at_idx
  on public.listing_snapshots (source_url, captured_at desc);
