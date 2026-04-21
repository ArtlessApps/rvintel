# Cron Monitoring SQL Queries

Daily health checks for the `/api/scrape` cron runs. Every query targets Supabase and assumes you're running in the **SQL editor** (service role) — the anon key cannot read `cron_runs`, `listings`, or `listing_snapshots` due to RLS.

## Schedule reference

| UTC | local (PDT) | cron | targets |
|---|---|---|---|
| 06:00 | 23:00 prev day | `rvshare-1` | rvshare a, b, c, travel-trailer |
| 06:10 | 23:10 prev day | `rvshare-2` | rvshare fifth-wheel, toy-hauler, pop-up, truck-camper |
| 06:20 | 23:20 prev day | `outdoorsy-1` | outdoorsy a, b |
| 07:00 | 00:00 | `outdoorsy-2` | outdoorsy c, tt |

All four crons should log exactly one row to `public.cron_runs` per day. A missing row means the function either never fired or was killed before `logCronRun` could write (e.g. hit the 300s `maxDuration`).

## 1. Morning health check — did every cron run?

One row per expected cron. If any platform is missing or `status <> 'success'`, investigate.

```sql
select
  platform,
  started_at,
  status,
  duration_ms,
  listings_upserted,
  snapshots_inserted,
  error_count
from public.cron_runs
where started_at > current_date       -- today in UTC
order by started_at;
```

Expected output: 4 rows, all `success`, totalling ~110–160 `listings_upserted`.

## 2. Did each cron run at all in the last 24h?

Most recent run per platform. If a platform is missing from the result set, that cron never logged.

```sql
select distinct on (platform)
  platform,
  started_at,
  status,
  duration_ms,
  listings_upserted,
  snapshots_inserted,
  error_count,
  error_message
from public.cron_runs
where started_at > now() - interval '24 hours'
order by platform, started_at desc;
```

## 3. Last 20 runs across everything

The "tail -f" for the scraper. Use this when triaging after a pager-like ping.

```sql
select
  started_at,
  platform,
  status,
  duration_ms,
  listings_upserted,
  snapshots_inserted,
  skipped_not_rv,
  error_count,
  error_message
from public.cron_runs
order by started_at desc
limit 20;
```

## 4. Show me what's failing

Only rows where at least one target errored. `errors` is a `jsonb` array of per-target failure messages.

```sql
select
  started_at,
  platform,
  status,
  error_count,
  errors,
  error_message
from public.cron_runs
where status <> 'success'
  and started_at > now() - interval '7 days'
order by started_at desc;
```

`status` taxonomy (from `app/api/scrape/route.ts:497`):
- `success` — zero errors
- `partial` — some targets wrote rows, others errored (common on Outdoorsy bot defense)
- `failure` — no rows written and at least one error (full outage)
- `error_message` non-null → `scrapeMarket` itself threw; none of the targets even started

## 5. Drill into a specific cron's error history

Swap the platform name to pivot.

```sql
select
  started_at::date as day,
  status,
  error_count,
  errors
from public.cron_runs
where platform = 'outdoorsy-2'
  and started_at > now() - interval '14 days'
order by started_at desc;
```

## 6. Daily rollup — success rate + data volume trend

Rolls up every run in the last 14 days by day/platform. Quick visual check for regression.

```sql
select
  date_trunc('day', started_at) as day,
  platform,
  count(*) as runs,
  sum(case when status = 'success' then 1 else 0 end) as successes,
  sum(case when status = 'partial' then 1 else 0 end) as partials,
  sum(case when status = 'failure' then 1 else 0 end) as failures,
  round(avg(duration_ms)) as avg_ms,
  max(duration_ms) as max_ms,
  sum(listings_upserted) as total_upserts,
  sum(snapshots_inserted) as total_snapshots
from public.cron_runs
where started_at > now() - interval '14 days'
group by 1, 2
order by 1 desc, 2;
```

## 7. Duration creep — are we trending toward the 300s cap?

If `max_ms` starts climbing above ~240,000 (240s), the function is at risk of being killed mid-run. Bump `CALL_TIMEOUT_MS` down, split into another group, or add a platform-3 cron.

```sql
select
  platform,
  date_trunc('day', started_at) as day,
  round(avg(duration_ms)) as avg_ms,
  max(duration_ms)         as max_ms,
  round(percentile_cont(0.95) within group (order by duration_ms)) as p95_ms
from public.cron_runs
where started_at > now() - interval '30 days'
group by 1, 2
order by 2 desc, 1;
```

Danger thresholds:
- `p95_ms > 240_000` → investigate
- `max_ms > 270_000` → imminent 300s cap hits; split the cron

## 8. Data health — what actually landed in `listings` today?

Crosses `cron_runs` and `listings` to confirm today's upserts really hit the DB.

```sql
select
  platform,
  rv_class,
  count(*)                as listings_touched,
  count(*) filter (where first_seen_at::date = current_date) as new_listings,
  round(avg(nightly_rate))::int as avg_nightly_rate,
  min(nightly_rate)       as min_rate,
  max(nightly_rate)       as max_rate
from public.listings
where last_seen_at::date = current_date
group by 1, 2
order by 1, 2;
```

## 9. Snapshot health — time-series is the moat

Confirms that every cron actually wrote to `listing_snapshots` (not just `listings`). Zero snapshots is a silent data-loss bug.

```sql
select
  date_trunc('day', captured_at) as day,
  count(*)                       as snapshots,
  count(distinct listing_id)     as unique_listings,
  count(distinct source_url)     as source_urls_used
from public.listing_snapshots
where captured_at > now() - interval '14 days'
group by 1
order by 1 desc;
```

## 10. Per-target snapshot coverage (variant-rotation audit)

Uses the `source_url` column (migration 003) to verify every target URL is producing unique listings. If two targets consistently surface identical listings, one of them is dead weight.

```sql
select
  source_url,
  date_trunc('day', captured_at) as day,
  count(*)                   as snapshots,
  count(distinct listing_id) as unique_listings
from public.listing_snapshots
where captured_at > now() - interval '7 days'
  and source_url is not null
group by 1, 2
order by 2 desc, 1;
```

## 11. Listing churn — how fast does the fleet turn over?

Sanity check for `first_seen_at` / `last_seen_at`. A healthy San Diego market should be adding a handful of new listings daily and "losing" (last_seen older than 3 days) a similar number.

```sql
select
  platform,
  count(*) filter (where first_seen_at::date = current_date)                  as new_today,
  count(*) filter (where last_seen_at  > now() - interval '2 days')           as active_2d,
  count(*) filter (where last_seen_at <= now() - interval '3 days'
                    and last_seen_at  > now() - interval '14 days')           as stale_3_14d,
  count(*) filter (where last_seen_at <= now() - interval '14 days')          as missing_14d_plus,
  count(*)                                                                    as total
from public.listings
group by 1
order by 1;
```

## 12. Silent gaps — days the cron *should* have logged but didn't

Generates the expected daily series for the last 14 days and left-joins against actual logs. Missing rows are silent cron outages (function killed before `logCronRun`, or the cron trigger itself was never registered).

```sql
with expected as (
  select
    d::date as day,
    p       as platform
  from generate_series(current_date - interval '13 days', current_date, interval '1 day') as d
  cross join unnest(array['rvshare-1','rvshare-2','outdoorsy-1','outdoorsy-2']) as p
),
actual as (
  select started_at::date as day, platform
  from public.cron_runs
  where started_at > current_date - interval '14 days'
  group by 1, 2
)
select e.day, e.platform
from expected e
left join actual a using (day, platform)
where a.platform is null
order by e.day desc, e.platform;
```

Empty result = no missed runs in the window. Any row is a gap to investigate in Vercel's function logs.

---

## Quick triage playbook

1. **Query 1** — "did everything run?" If yes and all `success`, stop.
2. If any row is `partial` or `failure`, run **Query 4** for the error list.
3. If any platform is missing entirely, run **Query 12** to confirm it's a cron outage, then check Vercel → Functions → Logs filtered to `/api/scrape`.
4. If errors are timeouts (`firecrawl call timed out after 180s`), run **Query 7** — the cron may be approaching the function cap.
5. If errors are `ERR_EMPTY_RESPONSE` or 403s on Outdoorsy, the stealth proxy IP got flagged — usually self-resolves the next day.
