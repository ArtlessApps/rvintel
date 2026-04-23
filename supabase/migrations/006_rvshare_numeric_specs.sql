-- Fix: RVshare returns decimal values for specs we typed as integer in
-- migration 005 (observed during 2026-04-23 backfill — values like "40.5",
-- "20.5", "43.5", "42.5" rejected by Postgres as "invalid input syntax for
-- type integer"). Looking at the RVshare payload, `fresh_water_tank`,
-- `generator_usage_included`, and `nightly_mileage_included` can all come
-- back as non-integer strings; `electric_service` has been observed as
-- integer-only but gets the same relaxation for consistency.
--
-- `sleeps` stays integer — the API exposes it as `how_many_it_sleeps` and it
-- is always a whole number (you cannot sleep a fractional person).
--
-- ALTER is safe because:
--   1. numeric is a superset of integer — every prior-integer value converts cleanly.
--   2. The columns were added NULLABLE in migration 005 and no app code reads
--      them yet; changing type cannot break an existing query plan.
--
-- Safe to re-run (idempotent — ALTER COLUMN TYPE to the same type is a no-op).

alter table public.listings
  alter column electric_service         type numeric using electric_service::numeric,
  alter column fresh_water_tank         type numeric using fresh_water_tank::numeric,
  alter column generator_usage_included type numeric using generator_usage_included::numeric,
  alter column nightly_mileage_included type numeric using nightly_mileage_included::numeric;
