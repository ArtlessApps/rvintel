# How RVIntel Works (Behind the Scenes)

This guide explains what happens when someone uses the site or when data updates—written for readers who are new to web apps.

---

## The big picture

**RVIntel** is a **Next.js** web application. Next.js is a framework that runs **React** (a library for building interactive pages) on the server and in the browser. The app has three main “moving parts”:

1. **The marketing home page** (`/`) — collects waitlist emails.
2. **The market dashboard** (`/dashboard`) — shows rental listings and simple charts from a database.
3. **A background data pipeline** — periodically pulls listing data from rental sites and saves it to the database.

Think of it as: **browser ↔ your app on Vercel ↔ Supabase (database)**, plus **scheduled jobs** that call a special API route to refresh listing data using **Firecrawl** (a service that can load web pages and extract structured information).

---

## What runs where?

| Piece | Where it runs | Role |
|--------|----------------|------|
| Home page & dashboard UI | In the visitor’s **browser** | Buttons, forms, charts, navigation |
| **Supabase client** (anon key) | In the **browser** | Read listings; insert waitlist rows (subject to your Supabase security rules) |
| **`/api/scrape`** | On **Vercel** (server) | Scrape listing sites, then write to the database with elevated permissions |
| **Cron jobs** | **Vercel** triggers HTTP GETs on a schedule | Kick off scraping in chunks so each run finishes within time limits |
| **Vercel Analytics** | In **production** only | Anonymous usage metrics |

---

## 1. Home page — waitlist

When someone enters an email and submits:

1. The page runs JavaScript in the browser (the file is a **client component** — it starts with `"use client"`).
2. It calls **Supabase** using the **public (anon) key**. That key is safe to ship in the browser; what it can do is controlled by **Row Level Security** policies you set in Supabase.
3. The code inserts a row into the **`waitlist`** table with that email.

If Supabase isn’t configured (missing environment variables), the app will error when it tries to connect—so local development needs a `.env.local` file modeled on `.env.local.example`.

---

## 2. Dashboard — reading market data

The dashboard is also a client page. When you pick a **market** and **RV class**:

1. The browser uses the same Supabase client (anon key).
2. It **selects** rows from the **`listings`** table filtered by `market` and `rv_class`, sorted by nightly rate.
3. It computes summaries in the browser (average rate, min/max, distribution buckets for the bar chart, “most reviewed” list, etc.).

**Important:** The time “window” control (e.g. last 7 / 30 / 90 days) may appear in the UI, but listing queries are driven by the latest scraped data for that market/class—not necessarily filtered by that window in code. If you extend the product, that’s where you’d tie dates to `scraped_at` or historical tables.

---

## 3. Where listing data comes from — `/api/scrape`

This is a **Route Handler** in Next.js: a file under `app/api/…/route.ts` that responds to HTTP requests like a small API.

### What it does (simplified)

1. **Authorization**  
   In production you should set `CRON_SECRET`. The route accepts requests only if the caller sends the right header (or Vercel Cron’s header). If `CRON_SECRET` is unset (typical in local dev), the route is open—useful for testing, risky if exposed publicly without a secret.

2. **Firecrawl**  
   The server uses your `FIRECRAWL_API_KEY` to ask Firecrawl to open specific **search URLs** on **Outdoorsy** and **RVshare** (configured per “market,” e.g. San Diego). Firecrawl can render pages like a real browser and return **markdown** plus **JSON** shaped by a schema.

3. **Structured extraction**  
   A **Zod** schema defines the shape of each listing (URL, rates, ratings, amenities, RV class, etc.). Firecrawl’s extraction is guided by a long prompt so listings are classified consistently (Class A/B/C, trailers, etc.).

4. **Cleanup and rules**  
   After extraction, the code may **override** the model’s RV class using **deterministic rules** (e.g. matching known model names) to reduce mistakes.

5. **Database write**  
   The route uses the **Supabase service role key** (`SUPABASE_SERVICE_ROLE_KEY`). That key bypasses normal user rules and is **only for trusted server code**—never put it in the browser or commit it to git.

6. **Upsert**  
   Rows are **upserted** into **`listings`** on `listing_url` so re-scraping updates existing listings instead of duplicating them. Invalid URLs or non-RV rows may be skipped.

### Why three cron schedules?

Scraping many pages can take longer than a single serverless function is allowed to run on some plans. `vercel.json` defines **three cron jobs** that call `/api/scrape` with different `platform` query parameters (e.g. RVshare vs two batches of Outdoorsy). That splits work into smaller chunks.

Note: the route file also sets a long `maxDuration` for the function, while `vercel.json` may set a different cap—**the stricter or platform-specific limit wins** in practice. If scrapes time out, this is the first place to check.

---

## 4. Configuration secrets (`.env.local`)

Typical variables (see `.env.local.example`):

- **`NEXT_PUBLIC_SUPABASE_URL`** / **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — used by the browser and server for normal reads/writes allowed by RLS.
- **`SUPABASE_SERVICE_ROLE_KEY`** — server-only; used by `/api/scrape` to upsert listings.
- **`FIRECRAWL_API_KEY`** — server-only; scraping.
- **`CRON_SECRET`** — shared secret so only Vercel Cron (or you, with the header) can trigger scrapes in production.

Variables prefixed with `NEXT_PUBLIC_` are embedded in client bundles—never put the service role key there.

---

## 5. Other files you might notice

- **`components/dashboard-preview.tsx`** and hero imagery on `/` are **marketing mockups**—they illustrate the product; they are not wired to live data.
- **`lib/supabase.ts`** — creates the Supabase client and documents TypeScript shapes for `listings`, `availability_snapshots`, and `waitlist`. Not every table may be used by the UI yet.
- **`scripts/`** — optional local scripts (e.g. lead exports); they are not part of the Next.js request path unless you run them yourself.

---

## 6. End-to-end flow (mental model)

```text
Visitor opens /
    → Browser loads React UI
    → Submit email → Supabase waitlist (anon key + RLS)

Visitor opens /dashboard
    → Browser queries Supabase listings (anon key + RLS)

Every other day (cron) on Vercel
    → GET /api/scrape?platform=...
    → Server: Firecrawl pages → extract JSON → upsert listings (service role)
    → Dashboard shows updated rows on next refresh
```

---

## Summary

- **Frontend:** Next.js + React; home and dashboard talk to Supabase from the browser for waitlist and listing reads.
- **Backend (lightweight):** One API route scrapes competitor sites via Firecrawl and writes to Supabase with a privileged key.
- **Scheduling:** Vercel Cron hits that route in slices so scraping stays within execution limits.
- **Safety:** Keep the service role key and Firecrawl key on the server; use RLS in Supabase to protect public data appropriately.

If you change markets, URLs, or table shapes, update `app/api/scrape/route.ts`, Supabase schema, and any dashboard filters together so they stay in sync.
