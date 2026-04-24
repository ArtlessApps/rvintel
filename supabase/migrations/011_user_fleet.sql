-- User fleet: tracks which listings a visitor is monitoring.
-- session_id is a localStorage UUID (pre-auth); swap for user_id when auth lands.
-- Service-role API routes bypass RLS for reads/writes; the policies here enforce
-- correctness if the table is ever accessed via the anon client.

create table if not exists public.user_fleet (
  id           uuid        primary key default gen_random_uuid(),
  session_id   text        not null,
  listing_id   uuid        references public.listings(id) on delete set null,
  listing_url  text        not null,
  nickname     text,
  added_at     timestamptz not null default now()
);

create index if not exists user_fleet_session_idx on public.user_fleet (session_id);
create index if not exists user_fleet_listing_idx on public.user_fleet (listing_id);

alter table public.user_fleet enable row level security;

create policy "session owner select" on public.user_fleet
  for select using (
    session_id = current_setting('request.headers', true)::json->>'x-fleet-session'
  );

create policy "session owner insert" on public.user_fleet
  for insert with check (
    session_id = current_setting('request.headers', true)::json->>'x-fleet-session'
  );

create policy "session owner delete" on public.user_fleet
  for delete using (
    session_id = current_setting('request.headers', true)::json->>'x-fleet-session'
  );
