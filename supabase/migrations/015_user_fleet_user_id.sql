-- Fleet entries linked to auth.users (user_id may already exist in production).
-- Indexes support plan-limit counts and upsert on (user_id, listing_url).

alter table public.user_fleet
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists user_fleet_user_idx on public.user_fleet (user_id);

create unique index if not exists user_fleet_user_url_idx
  on public.user_fleet (user_id, listing_url)
  where user_id is not null;
