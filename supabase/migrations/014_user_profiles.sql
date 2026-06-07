-- User profiles: subscription state, Stripe IDs, and trial metadata.
-- One row per auth.users record. Created by admin activate or first checkout.

create table if not exists public.user_profiles (
  id                      uuid        primary key references auth.users(id) on delete cascade,
  email                   text,
  subscription_tier       text        not null default 'none',
  subscription_status     text        not null default 'none',
  trial_ends_at           timestamptz,
  current_period_end      timestamptz,
  stripe_customer_id      text        unique,
  stripe_subscription_id  text        unique,
  activated_from_waitlist boolean     not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists user_profiles_stripe_customer_idx
  on public.user_profiles (stripe_customer_id);

alter table public.user_profiles enable row level security;

drop policy if exists "users read own profile" on public.user_profiles;
drop policy if exists "users update own profile" on public.user_profiles;

-- Dashboard layout reads subscription fields with the anon client + session cookie.
create policy "users read own profile" on public.user_profiles
  for select using (auth.uid() = id);

-- Allow users to update non-sensitive fields if needed later (e.g. display name).
create policy "users update own profile" on public.user_profiles
  for update using (auth.uid() = id);
