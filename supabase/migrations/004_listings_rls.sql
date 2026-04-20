-- Make the listings RLS posture explicit.
--
-- Before this migration RLS was OFF on public.listings (Supabase's default for
-- tables created without `enable row level security`). The dashboard worked
-- because the anon key could read the table directly, but the "anon can read
-- everything" decision was implicit — the first migration that accidentally
-- enabled RLS without a policy would silently break the dashboard.
--
-- This migration makes the anon-readable posture deliberate: RLS ON with a
-- single SELECT policy granting read access to the `anon` and `authenticated`
-- roles. Scrape writes still flow through the service role key in
-- /api/scrape, which bypasses RLS entirely.
--
-- When Tier 2 (server-rendered dashboard with service-role reads) lands, drop
-- the anon SELECT policy. At that point the anon key sees nothing and the
-- dashboard can only be read through the server.
--
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).

alter table public.listings enable row level security;

drop policy if exists "listings_anon_read" on public.listings;
create policy "listings_anon_read"
  on public.listings
  for select
  to anon, authenticated
  using (true);
