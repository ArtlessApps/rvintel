#!/usr/bin/env node
/**
 * Generate lightweight market magnets (FB Markdown + HTML rate cards) and
 * programmatic SEO JSON for live markets from Supabase listings_in_market.
 *
 * Usage:
 *   node scripts/generate_market_magnets.mjs
 *   node scripts/generate_market_magnets.mjs san-diego-ca phoenix-az
 *   pnpm magnets
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { liveMarketList, loadMarkets } from "./lib/markets-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .trim();
  }
}

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.rvintel.io";
const SITE_URL =
  /localhost|127\.0\.0\.1/i.test(rawSiteUrl)
    ? "https://www.rvintel.io"
    : rawSiteUrl.replace(/\/$/, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function quantile(sorted, p) {
  if (!sorted?.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

function rateStats(rates) {
  if (!rates?.length) {
    return { count: 0, avg: null, median: null, p25: null, p75: null };
  }
  const sorted = [...rates].sort((a, b) => a - b);
  const sum = sorted.reduce((a, v) => a + v, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    median: Math.round(quantile(sorted, 0.5)),
    p25: Math.round(quantile(sorted, 0.25)),
    p75: Math.round(quantile(sorted, 0.75)),
  };
}

function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtNum(n) {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function classLabel(cls) {
  if (!cls) return "Other";
  return String(cls)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchListings(slug) {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .rpc("listings_in_market", {
        p_market_slug: slug,
        p_rv_class: null,
        p_active_only: true,
      })
      .select("nightly_rate, rv_class, platform, delivery, instant_book, scraped_at")
      .not("nightly_rate", "is", null)
      .gt("nightly_rate", 0)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${slug}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function computeMagnet(market, listings) {
  const rates = listings.map((l) => l.nightly_rate).filter((r) => r != null && r > 0);
  const overall = rateStats(rates);
  const outdoorsyCount = listings.filter((l) => l.platform === "outdoorsy").length;
  const rvshareCount = listings.filter((l) => l.platform === "rvshare").length;
  const withDelivery = listings.filter((l) => l.delivery === true).length;
  const withInstant = listings.filter((l) => l.instant_book === true).length;
  const deliveryPct = listings.length
    ? Math.round((withDelivery / listings.length) * 100)
    : null;
  const instantBookPct = listings.length
    ? Math.round((withInstant / listings.length) * 100)
    : null;

  const classMap = new Map();
  for (const l of listings) {
    const key = l.rv_class || "other";
    if (!classMap.has(key)) classMap.set(key, []);
    classMap.get(key).push(l.nightly_rate);
  }
  const byClass = [...classMap.entries()]
    .map(([cls, clsRates]) => {
      const s = rateStats(clsRates);
      return { class: cls, label: classLabel(cls), count: s.count, medianRate: s.median };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  let asOf = null;
  for (const l of listings) {
    if (!l.scraped_at) continue;
    if (!asOf || l.scraped_at > asOf) asOf = l.scraped_at;
  }

  const city = market.displayName;
  const shortCity = city.replace(/,\s*[A-Z]{2}$/, "");
  const listingCount = outdoorsyCount + rvshareCount;
  const odsPct = listingCount
    ? Math.round((outdoorsyCount / listingCount) * 100)
    : 0;
  const rvsPct = listingCount ? 100 - odsPct : 0;

  const topClassBits = byClass
    .slice(0, 3)
    .map((c) => `${c.label} median ${fmtMoney(c.medianRate)} (${fmtNum(c.count)} listings)`)
    .join("; ");

  const gap =
    overall.avg != null && overall.median != null
      ? overall.avg - overall.median
      : null;

  const introHtml = [
    `<p>${escapeHtml(city)} RV rental hosts currently compete across <strong>${fmtNum(listingCount)} active listings</strong> on Outdoorsy and RVshare within a ${market.radiusMiles}-mile radius. The median asking rate is <strong>${fmtMoney(overall.median)}/night</strong> (average ${fmtMoney(overall.avg)})${gap != null && gap !== 0 ? `, a ${fmtMoney(Math.abs(gap))} ${gap > 0 ? "premium of the mean over the median" : "discount of the mean under the median"} that signals how skewed high-end inventory is` : ""}.</p>`,
    `<p>Platform mix is roughly <strong>${odsPct}% Outdoorsy / ${rvsPct}% RVshare</strong> (${fmtNum(outdoorsyCount)} vs ${fmtNum(rvshareCount)}). ${topClassBits ? `By class: ${escapeHtml(topClassBits)}.` : ""} ${deliveryPct != null ? `${deliveryPct}% of listings offer delivery;` : ""} ${instantBookPct != null ? `${instantBookPct}% are instant book.` : ""}</p>`,
    `<p>Figures are computed from active geo-scoped listings with a positive nightly rate. Use this page as a pricing baseline, then refine against comps in your class, length, and amenity bundle.</p>`,
  ].join("\n");

  const description = `${city} RV rental prices: median ${fmtMoney(overall.median)}/night across ${fmtNum(listingCount)} Outdoorsy & RVshare listings. Live market benchmarks for hosts.`
    .slice(0, 155);

  const faq = [
    {
      question: `What is the average RV rental rate in ${shortCity}?`,
      answer: `The average asking rate in ${city} is ${fmtMoney(overall.avg)} per night; the median is ${fmtMoney(overall.median)} (P25 ${fmtMoney(overall.p25)} · P75 ${fmtMoney(overall.p75)}) across ${fmtNum(listingCount)} active listings.`,
    },
    {
      question: `How many RV rentals are listed in ${shortCity}?`,
      answer: `RVIntel currently tracks ${fmtNum(listingCount)} active listings in the ${city} market window (${market.radiusMiles} mi): ${fmtNum(outdoorsyCount)} on Outdoorsy and ${fmtNum(rvshareCount)} on RVshare.`,
    },
    {
      question: `Is Outdoorsy or RVshare larger in ${shortCity}?`,
      answer:
        outdoorsyCount >= rvshareCount
          ? `Outdoorsy currently has more inventory in ${city} (${fmtNum(outdoorsyCount)} vs ${fmtNum(rvshareCount)} on RVshare). Many hosts list on both.`
          : `RVshare currently has more inventory in ${city} (${fmtNum(rvshareCount)} vs ${fmtNum(outdoorsyCount)} on Outdoorsy). Many hosts list on both.`,
    },
  ];

  const asOfLabel = asOf
    ? new Date(asOf).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  const monthYear = new Date(asOf ?? Date.now()).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    slug: market.slug,
    displayName: market.displayName,
    region: market.region,
    radiusMiles: market.radiusMiles,
    asOf: asOf ?? new Date().toISOString(),
    asOfLabel,
    monthYear,
    listingCount,
    avgRate: overall.avg,
    medianRate: overall.median,
    p25: overall.p25,
    p75: overall.p75,
    outdoorsyCount,
    rvshareCount,
    deliveryPct,
    instantBookPct,
    byClass,
    seo: {
      title: `${city} RV Rental Market`,
      description,
      introHtml,
      faq,
    },
    magnetPath: `/magnets/${market.slug}-rate-card.html`,
    marketPath: `/markets/${market.slug}`,
  };
}

function renderMarkdown(m) {
  const classRows = m.byClass
    .map((c) => `| ${c.label} | ${fmtNum(c.count)} | ${fmtMoney(c.medianRate)} |`)
    .join("\n");

  return `# ${m.displayName} RV Rental Rate Card — ${m.monthYear}

**${fmtNum(m.listingCount)} active listings** · Median **${fmtMoney(m.medianRate)}/night** · Avg **${fmtMoney(m.avgRate)}/night**

- P25–P75: ${fmtMoney(m.p25)} – ${fmtMoney(m.p75)}
- Outdoorsy: ${fmtNum(m.outdoorsyCount)} · RVshare: ${fmtNum(m.rvshareCount)}
- Delivery: ${m.deliveryPct ?? "—"}% · Instant book: ${m.instantBookPct ?? "—"}%
- Radius: ${m.radiusMiles} mi · Region: ${m.region}

## Rates by class

| Class | Listings | Median / night |
| --- | ---: | ---: |
${classRows}

Full market page: ${SITE_URL.replace(/\/$/, "")}${m.marketPath}
Shareable rate card: ${SITE_URL.replace(/\/$/, "")}${m.magnetPath}

_Data as of ${m.asOfLabel} · Outdoorsy + RVshare · RVIntel_
`;
}

function renderHtml(m) {
  const classRows = m.byClass
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.label)}</td><td class="num">${fmtNum(c.count)}</td><td class="num">${fmtMoney(c.medianRate)}</td></tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(m.displayName)} RV Rental Rate Card · RVIntel</title>
  <meta name="description" content="${escapeHtml(m.seo.description)}" />
  <style>
    :root {
      --teal: #2dd4bf;
      --teal-deep: #006b5f;
      --ink: #191c1e;
      --muted: #5f6b68;
      --surface: #f4f7f6;
      --card: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: var(--ink);
      background: linear-gradient(160deg, #e8f5f2 0%, var(--surface) 40%, #fff 100%);
      min-height: 100vh;
      padding: 2rem 1rem;
    }
    .card {
      max-width: 640px;
      margin: 0 auto;
      background: color-mix(in oklab, var(--card) 92%, transparent);
      backdrop-filter: blur(20px);
      border-radius: 0.25rem;
      box-shadow: 0 12px 40px rgba(25, 28, 30, 0.06);
      overflow: hidden;
    }
    .accent { height: 4px; background: linear-gradient(90deg, var(--teal-deep), var(--teal)); }
    .inner { padding: 1.75rem 1.5rem 2rem; }
    .eyebrow {
      font-size: 0.6875rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--teal-deep);
      font-weight: 600;
      margin: 0 0 0.5rem;
    }
    h1 {
      font-size: 1.75rem;
      line-height: 1.2;
      margin: 0 0 0.35rem;
      letter-spacing: -0.02em;
    }
    .sub { color: var(--muted); font-size: 0.875rem; margin: 0 0 1.5rem; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .metric {
      background: var(--surface);
      border-radius: 0.25rem;
      padding: 0.85rem 0.75rem;
    }
    .metric .label {
      font-size: 0.625rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.25rem;
    }
    .metric .value { font-size: 1.25rem; font-weight: 650; letter-spacing: -0.02em; }
    ul.bullets { margin: 0 0 1.5rem; padding-left: 1.1rem; color: var(--muted); font-size: 0.875rem; }
    ul.bullets li { margin-bottom: 0.35rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-bottom: 1.5rem; }
    th, td { text-align: left; padding: 0.55rem 0.35rem; border-bottom: 1px solid rgba(186, 202, 197, 0.35); }
    th { font-size: 0.625rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    td.num, th.num { text-align: right; }
    .cta {
      display: inline-block;
      text-decoration: none;
      color: #fff;
      font-weight: 600;
      font-size: 0.875rem;
      padding: 0.7rem 1.1rem;
      border-radius: 0.25rem;
      background: linear-gradient(135deg, var(--teal-deep), var(--teal));
    }
    .foot { margin-top: 1.25rem; font-size: 0.75rem; color: var(--muted); }
    @media print {
      body { background: #fff; padding: 0; }
      .card { box-shadow: none; }
    }
  </style>
</head>
<body>
  <article class="card">
    <div class="accent"></div>
    <div class="inner">
      <p class="eyebrow">${escapeHtml(m.region)} · ${m.radiusMiles} mi · RVIntel</p>
      <h1>${escapeHtml(m.displayName)} RV rental rates</h1>
      <p class="sub">Rate card · ${escapeHtml(m.monthYear)} · Outdoorsy + RVshare</p>
      <div class="metrics">
        <div class="metric"><div class="label">Active listings</div><div class="value">${fmtNum(m.listingCount)}</div></div>
        <div class="metric"><div class="label">Median / night</div><div class="value">${fmtMoney(m.medianRate)}</div></div>
        <div class="metric"><div class="label">Avg / night</div><div class="value">${fmtMoney(m.avgRate)}</div></div>
      </div>
      <ul class="bullets">
        <li>P25–P75: ${fmtMoney(m.p25)} – ${fmtMoney(m.p75)}</li>
        <li>Outdoorsy ${fmtNum(m.outdoorsyCount)} · RVshare ${fmtNum(m.rvshareCount)}</li>
        <li>Delivery ${m.deliveryPct ?? "—"}% · Instant book ${m.instantBookPct ?? "—"}%</li>
      </ul>
      <table>
        <thead><tr><th>Class</th><th class="num">Listings</th><th class="num">Median</th></tr></thead>
        <tbody>
${classRows}
        </tbody>
      </table>
      <a class="cta" href="${SITE_URL.replace(/\/$/, "")}${m.marketPath}">View full ${escapeHtml(m.displayName)} market →</a>
      <p class="foot">Data as of ${escapeHtml(m.asOfLabel)} · Active geo-scoped listings with positive nightly rates · rvintel.io</p>
    </div>
  </article>
</body>
</html>
`;
}

async function main() {
  const argSlugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const allLive = liveMarketList();
  let targets;
  if (argSlugs.length) {
    const map = loadMarkets();
    targets = argSlugs.map((slug) => {
      const m = map.get(slug);
      if (!m) throw new Error(`Unknown or non-live market: ${slug}`);
      return m;
    });
  } else {
    targets = allLive;
  }

  const outJsonDir = path.join(ROOT, "lib", "generated");
  const outMdDir = path.join(ROOT, "content", "magnets");
  const outHtmlDir = path.join(ROOT, "public", "magnets");
  for (const dir of [outJsonDir, outMdDir, outHtmlDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** @type {Record<string, object>} */
  const existingPath = path.join(outJsonDir, "market-magnets.json");
  /** When regenerating a subset, merge into the existing bundle so other markets keep their CTAs. */
  const bundle = argSlugs.length && fs.existsSync(existingPath)
    ? { ...(JSON.parse(fs.readFileSync(existingPath, "utf-8")).markets ?? {}) }
    : {};
  let generated = 0;
  let skipped = 0;

  for (const market of targets) {
    process.stdout.write(`\n${market.slug}... `);
    const listings = await fetchListings(market.slug);
    if (!listings.length) {
      console.log("skip (no priced listings)");
      skipped++;
      continue;
    }
    const magnet = computeMagnet(market, listings);
    bundle[market.slug] = magnet;

    fs.writeFileSync(
      path.join(outMdDir, `${market.slug}-rate-card.md`),
      renderMarkdown(magnet),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(outHtmlDir, `${market.slug}-rate-card.html`),
      renderHtml(magnet),
      "utf-8"
    );
    console.log(`${magnet.listingCount} listings · median ${fmtMoney(magnet.medianRate)}`);
    generated++;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    siteUrl: SITE_URL,
    markets: bundle,
  };
  fs.writeFileSync(
    path.join(outJsonDir, "market-magnets.json"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf-8"
  );

  console.log(
    `\nDone. ${generated} magnet(s), ${skipped} skipped → lib/generated/market-magnets.json` +
      (argSlugs.length ? " (merged into existing bundle)" : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
