-- Phase 1: Time-series snapshots + listing lifecycle tracking.
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).

-- ── 1. listing_snapshots ─────────────────────────────────────────────────────
-- Append-only history of nightly_rate and volatile metrics per listing.
-- This is the foundation for future features (price trends, comp-set stats,
-- occupancy inference). Time depth cannot be backfilled — start writing now.
create table if not exists public.listing_snapshots (
  listing_id   uuid        not null references public.listings(id) on delete cascade,
  captured_at  timestamptz not null default now(),
  nightly_rate numeric     not null,
  weekly_rate  numeric,
  review_count integer,
  avg_rating   numeric,
  primary key (listing_id, captured_at)
);

create index if not exists listing_snapshots_captured_at_idx
  on public.listing_snapshots (captured_at desc);

-- Service-role writes bypass RLS, but enable RLS so the anon key cannot read
-- snapshots until we explicitly expose them (keeps the dataset private for now).
alter table public.listing_snapshots enable row level security;

-- ── 2. Listing lifecycle columns ─────────────────────────────────────────────
-- first_seen_at   — immutable; set once on insert via default.
-- last_seen_at    — updated every time a scrape surfaces the listing.
-- is_active       — flipped false by a sweeper when last_seen_at ages out.
-- enriched_at     — set by the detail-page enrichment route (phase 2).
alter table public.listings
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at  timestamptz not null default now(),
  add column if not exists is_active     boolean     not null default true,
  add column if not exists enriched_at   timestamptz;

-- Support the hot dashboard query: "active listings in market/class, freshest first".
create index if not exists listings_market_class_fresh_idx
  on public.listings (market, rv_class, is_active, scraped_at desc);

-- ── Notes ────────────────────────────────────────────────────────────────────
-- `scraped_at` already means "last time we confirmed this price" — it is
-- effectively last_priced_at. No need for a separate column.
--
-- If this migration runs on a table that already has rows, every existing row
-- gets first_seen_at = last_seen_at = now() and is_active = true. That is a
-- harmless starting point; the timestamps will correct themselves as crons run.
