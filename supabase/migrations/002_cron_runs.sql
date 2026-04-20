-- Phase 1.5: Cron run observability.
-- One row per /api/scrape invocation so we can see at a glance what ran,
-- when it ran, whether it succeeded, and what it wrote to the database.
-- Append-only log; never update rows. Safe to re-run (idempotent).

create table if not exists public.cron_runs (
  id                 uuid        primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  duration_ms        integer,
  market             text        not null,
  platform           text,                      -- "rvshare", "outdoorsy-1", "outdoorsy-2", or null = all
  status             text        not null,      -- "success" | "partial" | "failure"
  listings_upserted  integer     not null default 0,
  snapshots_inserted integer     not null default 0,
  skipped_not_rv     integer     not null default 0,
  error_count        integer     not null default 0,
  errors             jsonb,                     -- array of per-target error strings
  error_message      text                       -- top-level 500 reason (non-null => run never completed scrapeMarket)
);

-- Dashboard / tail query: "last 50 runs across all crons"
create index if not exists cron_runs_started_at_idx
  on public.cron_runs (started_at desc);

-- Per-cron filtering: "last 20 rvshare runs"
create index if not exists cron_runs_platform_started_at_idx
  on public.cron_runs (platform, started_at desc);

-- Service-role writes bypass RLS. Enable RLS so the anon key cannot read the
-- log table until we explicitly expose it (e.g. via an admin-only view).
alter table public.cron_runs enable row level security;
