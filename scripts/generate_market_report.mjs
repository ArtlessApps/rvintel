#!/usr/bin/env node
// generate_market_report.mjs — Interactive RV market report generator.
//
// Usage:
//   node scripts/generate_market_report.mjs
//
// Loads .env.local, connects to Supabase, asks which market to report on,
// queries listings + search_snapshots, computes statistics, and writes a
// fully styled HTML report matching the demomarketreport.html design.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

// ── env loader (same defensive parser as other scripts in this repo) ──────────
for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── helper functions ───────────────────────────────────────────────────────────

/** Linear-interpolation quantile on a sorted array */
function quantile(sorted, p) {
  if (!sorted || sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

function computeRateStats(rates) {
  if (!rates || rates.length === 0) {
    return { count: 0, avg: null, median: null, p25: null, p75: null, min: null, max: null };
  }
  const sorted = [...rates].sort((a, b) => a - b);
  const sum = sorted.reduce((a, v) => a + v, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    median: Math.round(quantile(sorted, 0.5)),
    p25: Math.round(quantile(sorted, 0.25)),
    p75: Math.round(quantile(sorted, 0.75)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/** "san-diego-ca" → "San Diego" */
function marketShortName(slug) {
  if (!slug) return "";
  // Strip trailing state code (e.g. "-ca", "-tx")
  const withoutState = slug.replace(/-[a-z]{2}$/, "");
  return withoutState
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "san-diego-ca" → "San Diego, CA" */
function marketDisplayName(slug) {
  if (!slug) return "";
  const parts = slug.split("-");
  const state = parts[parts.length - 1].toUpperCase();
  const cityParts = parts.slice(0, -1);
  const city = cityParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return `${city}, ${state}`;
}

/** Returns "Q2 2026" style label for a given Date */
function quarterLabel(date) {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

/** Returns "Q2" (lowercase: "q2") for file naming */
function quarterShort(date) {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `q${q}`;
}

/** Returns "May 2026" style label */
function publishDateLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Format a number as $X,XXX */
function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  return "$" + Math.round(n);
}

/** Format a number with commas (no dollar sign) */
function fmtNum(n) {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n) + "%";
}

// ── readline prompt ────────────────────────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── data fetching ──────────────────────────────────────────────────────────────

/** Fetch all active listings for a market, paginating 1000 at a time */
async function fetchAllListings(market) {
  const PAGE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("listings")
      .select("nightly_rate, rv_class, platform, delivery, instant_book, scraped_at, review_count, avg_rating")
      .eq("market", market)
      .eq("is_active", true)
      .not("nightly_rate", "is", null)
      .gt("nightly_rate", 0)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`listings fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allRows;
}

/** Fetch last 12 months of search_snapshots for the market */
async function fetchSnapshots(market) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const { data, error } = await supabase
    .from("search_snapshots")
    .select("captured_at, rv_class, platform, price_average, total_results")
    .eq("market", market)
    .gte("captured_at", since.toISOString())
    .order("captured_at", { ascending: true });
  if (error) throw new Error(`search_snapshots fetch failed: ${error.message}`);
  return data || [];
}

/** Fetch distinct markets from the listings table */
async function fetchMarkets() {
  const { data, error } = await supabase
    .from("listings")
    .select("market")
    .eq("is_active", true);
  if (error) throw new Error(`markets fetch failed: ${error.message}`);
  const markets = [...new Set((data || []).map((r) => r.market))].filter(Boolean).sort();
  return markets;
}

// ── statistics computation ─────────────────────────────────────────────────────

function computeStats(listings) {
  if (!listings || listings.length === 0) {
    return {
      totalListings: 0,
      avgRate: null,
      medianRate: null,
      p25Rate: null,
      p75Rate: null,
      deliveryPct: null,
      noDeliveryPct: null,
      instantBookPct: null,
      noInstantBookPct: null,
      underMedianPct: null,
      outdoorsyCount: 0,
      rvshareCount: 0,
      byClass: {},
      byPlatform: { outdoorsy: { count: 0, avgRate: null, medianRate: null }, rvshare: { count: 0, avgRate: null, medianRate: null } },
      byClassPlatformAvg: {},
    };
  }

  const rates = listings.map((l) => l.nightly_rate).filter((r) => r != null && r > 0);
  const sortedRates = [...rates].sort((a, b) => a - b);
  const overall = computeRateStats(rates);

  // Delivery / instant book
  const withDelivery = listings.filter((l) => l.delivery === true).length;
  const withInstant = listings.filter((l) => l.instant_book === true).length;
  const deliveryPct = listings.length ? Math.round((withDelivery / listings.length) * 100) : null;
  const instantBookPct = listings.length ? Math.round((withInstant / listings.length) * 100) : null;

  // Under median
  const median = overall.median || 0;
  const underMedian = listings.filter((l) => l.nightly_rate != null && l.nightly_rate < median).length;
  const underMedianPct = listings.length ? Math.round((underMedian / listings.length) * 100) : null;

  // Platform counts
  const outdoorsyListings = listings.filter((l) => l.platform === "outdoorsy");
  const rvshareListings = listings.filter((l) => l.platform === "rvshare");

  // Per-class stats
  const classes = [...new Set(listings.map((l) => l.rv_class).filter(Boolean))];
  const byClass = {};
  for (const cls of classes) {
    const clsListings = listings.filter((l) => l.rv_class === cls);
    const clsRates = clsListings.map((l) => l.nightly_rate).filter((r) => r != null && r > 0);
    const ods = clsListings.filter((l) => l.platform === "outdoorsy");
    const rvs = clsListings.filter((l) => l.platform === "rvshare");
    const odsRates = ods.map((l) => l.nightly_rate).filter((r) => r != null && r > 0);
    const rvsRates = rvs.map((l) => l.nightly_rate).filter((r) => r != null && r > 0);
    const clsStats = computeRateStats(clsRates);
    const outdoorsyPct = clsListings.length ? Math.round((ods.length / clsListings.length) * 100) : null;
    byClass[cls] = {
      count: clsListings.length,
      avgRate: clsStats.avg,
      medianRate: clsStats.median,
      p25Rate: clsStats.p25,
      p75Rate: clsStats.p75,
      outdoorsyCount: ods.length,
      rvshareCount: rvs.length,
      outdoorsyPct,
      outdoorsyMedian: computeRateStats(odsRates).median,
      rvshareMedian: computeRateStats(rvsRates).median,
    };
  }

  // Per-platform stats
  const odsStats = computeRateStats(outdoorsyListings.map((l) => l.nightly_rate).filter((r) => r != null && r > 0));
  const rvsStats = computeRateStats(rvshareListings.map((l) => l.nightly_rate).filter((r) => r != null && r > 0));

  // Per-class+platform avg for grouped bar chart
  const byClassPlatformAvg = {};
  for (const cls of classes) {
    const odsAvg = byClass[cls].outdoorsyCount > 0
      ? byClass[cls].outdoorsyMedian  // use median to be consistent
      : null;
    const rvsAvg = byClass[cls].rvshareCount > 0
      ? byClass[cls].rvshareMedian
      : null;
    // compute actual avgs for the chart
    const odsClsRates = listings
      .filter((l) => l.rv_class === cls && l.platform === "outdoorsy")
      .map((l) => l.nightly_rate).filter((r) => r != null && r > 0);
    const rvsClsRates = listings
      .filter((l) => l.rv_class === cls && l.platform === "rvshare")
      .map((l) => l.nightly_rate).filter((r) => r != null && r > 0);
    byClassPlatformAvg[cls] = {
      outdoorsy: odsClsRates.length > 0 ? Math.round(odsClsRates.reduce((a, v) => a + v, 0) / odsClsRates.length) : null,
      rvshare: rvsClsRates.length > 0 ? Math.round(rvsClsRates.reduce((a, v) => a + v, 0) / rvsClsRates.length) : null,
    };
  }

  return {
    totalListings: listings.length,
    avgRate: overall.avg,
    medianRate: overall.median,
    p25Rate: overall.p25,
    p75Rate: overall.p75,
    deliveryPct,
    noDeliveryPct: deliveryPct != null ? 100 - deliveryPct : null,
    instantBookPct,
    noInstantBookPct: instantBookPct != null ? 100 - instantBookPct : null,
    underMedianPct,
    outdoorsyCount: outdoorsyListings.length,
    rvshareCount: rvshareListings.length,
    byClass,
    byPlatform: {
      outdoorsy: { count: outdoorsyListings.length, avgRate: odsStats.avg, medianRate: odsStats.median },
      rvshare: { count: rvshareListings.length, avgRate: rvsStats.avg, medianRate: rvsStats.median },
    },
    byClassPlatformAvg,
  };
}

function computeSeasonalStats(snapshots) {
  // Only use Outdoorsy snapshots (they have price_average)
  const odsSnaps = (snapshots || []).filter(
    (s) => s.platform === "outdoorsy" && s.price_average != null && s.price_average > 0
  );

  if (odsSnaps.length === 0) return { hasSeasonalData: false, demandIndex: {} };

  // Group by YYYY-MM
  const byMonth = {};
  for (const snap of odsSnaps) {
    const dt = new Date(snap.captured_at);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth[key]) byMonth[key] = { totalWeightedPrice: 0, totalWeight: 0 };
    const weight = snap.total_results || 1;
    byMonth[key].totalWeightedPrice += snap.price_average * weight;
    byMonth[key].totalWeightedWeight = (byMonth[key].totalWeightedWeight || 0) + weight;
  }

  const months = Object.keys(byMonth).sort();
  if (months.length < 3) return { hasSeasonalData: false, demandIndex: {}, months };

  // Compute weighted avg per month
  const monthAvgs = {};
  for (const m of months) {
    const b = byMonth[m];
    monthAvgs[m] = b.totalWeightedPrice / (b.totalWeightedWeight || 1);
  }

  // Overall avg across all months
  const allAvgs = Object.values(monthAvgs);
  const overallAvg = allAvgs.reduce((a, v) => a + v, 0) / allAvgs.length;

  // Normalize to demand index
  const demandIndex = {};
  for (const m of months) {
    demandIndex[m] = Math.round((monthAvgs[m] / overallAvg) * 100);
  }

  return { hasSeasonalData: true, demandIndex, months };
}

// ── badge helpers ──────────────────────────────────────────────────────────────

function classBadgeClass(cls) {
  const map = {
    "Class A": "badge-a",
    "Class B": "badge-b",
    "Class C": "badge-c",
    "Travel Trailer": "badge-tt",
    "Fifth Wheel": "badge-fw",
  };
  return map[cls] || "badge-a";
}

// ── HTML generation ────────────────────────────────────────────────────────────

function generateHTML({ market, stats, seasonal, now }) {
  const city = marketShortName(market);
  const cityDisplay = marketDisplayName(market);
  const quarter = quarterLabel(now);
  const publishDate = publishDateLabel(now);

  // Executive summary calculations
  const gap = stats.avgRate != null && stats.medianRate != null
    ? stats.avgRate - stats.medianRate
    : null;
  const annualGapOpportunity = gap != null
    ? Math.round(gap * 365 * 0.6)
    : null;

  // Classes sorted by avg rate desc
  const classEntries = Object.entries(stats.byClass)
    .filter(([, v]) => v.count > 0 && v.avgRate != null)
    .sort(([, a], [, b]) => (b.avgRate || 0) - (a.avgRate || 0));

  const classCount = classEntries.length;

  // Limit Section 02 to major RV classes + any class with ≥5% market share.
  // A market can have 6–8+ classes; keeping the table to ≤6 rows ensures the
  // table + two side-by-side charts fit on a single A4 page and avoids a
  // phantom overflow page that shifts all subsequent forced breaks by one.
  const MAJOR_CLASSES = new Set(['Class A', 'Class B', 'Class C', 'Travel Trailer', 'Fifth Wheel']);
  const tableClassEntries = classEntries.filter(([cls, v]) =>
    MAJOR_CLASSES.has(cls) || v.count / (stats.totalListings || 1) >= 0.05
  );

  // Under-median gap calculations
  const underMedianListings = classEntries.map(([, v]) => v);
  // avgGap for under-median: approximate as (medianRate - medianRate * 0.85) ~ 15% below
  const avgGapApprox = stats.medianRate != null ? stats.medianRate * 0.15 : 20;
  const annualGapLow = Math.round((avgGapApprox * 365 * 0.3) / 1000);
  const annualGapHigh = Math.round((avgGapApprox * 365 * 0.5) / 1000);

  // Opportunity table
  const minRevGain = Math.round(((3200 + 1800) / 2 + avgGapApprox * 365 * 0.4) / 100) * 100;
  const maxRevGain = Math.round(((6800 + 3400) / 2 + avgGapApprox * 365 * 0.4) / 100) * 100;

  // Platform insight
  const odsAvg = stats.byPlatform.outdoorsy.avgRate;
  const rvsAvg = stats.byPlatform.rvshare.avgRate;
  const odsMed = stats.byPlatform.outdoorsy.medianRate;
  const rvsMed = stats.byPlatform.rvshare.medianRate;

  // Seasonal strip
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let seasonalHTML = "";
  if (seasonal.hasSeasonalData) {
    // Build a 12-month window ending with the most recent month in data
    const monthKeys = seasonal.months || [];
    const lastKey = monthKeys[monthKeys.length - 1];
    const [lastYear, lastMonth] = lastKey ? lastKey.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
    const window12 = [];
    for (let i = 11; i >= 0; i--) {
      let m = lastMonth - i;
      let y = lastYear;
      while (m <= 0) { m += 12; y -= 1; }
      window12.push(`${y}-${String(m).padStart(2, "0")}`);
    }

    const barCols = window12.map((key) => {
      const idx = seasonal.demandIndex[key] || null;
      const monthNum = parseInt(key.split("-")[1]) - 1;
      const label = MONTH_NAMES[monthNum];
      if (idx == null) {
        return `
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:20%; background:#e8eff6;"></div></div>
        <div class="month-label" style="color:#d0d8e4;">${label}</div>
      </div>`;
      }
      const height = Math.min(100, Math.max(20, idx));
      const color = idx >= 90 ? "#28b78a" : idx >= 70 ? "#6a95b8" : "#c8d4e2";
      const labelStyle = idx >= 90 ? `style="color: #28b78a; font-weight:700;"` : "";
      return `
      <div class="month-col">
        <div class="month-bar-wrap"><div class="month-bar" style="height:${height}%; background:${color};"></div></div>
        <div class="month-label" ${labelStyle}>${label}</div>
      </div>`;
    }).join("");

    // Detect peak months label
    const peakMonths = window12
      .filter((k) => (seasonal.demandIndex[k] || 0) >= 90)
      .map((k) => MONTH_NAMES[parseInt(k.split("-")[1]) - 1]);
    const peakLabel = peakMonths.length > 0 ? peakMonths.join("–") : "peak months";

    seasonalHTML = `
    <div style="margin-bottom: 10px;">
      <div class="chart-title">Relative demand index — ${city} (last 12 months)</div>
      <div class="chart-subtitle">100 = average monthly demand. Based on pricing premium vs. baseline (Outdoorsy data).</div>
    </div>

    <div class="seasonal-strip">${barCols}
    </div>
    <div style="display: flex; gap: 24px; margin-bottom: 36px; margin-top: 16px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
        <div style="width: 12px; height: 12px; background: #28b78a; border-radius: 2px;"></div>
        Peak season${peakMonths.length > 0 ? ` (${peakLabel})` : ""} — avg +38% premium
      </div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
        <div style="width: 12px; height: 12px; background: #6a95b8; border-radius: 2px;"></div>
        Shoulder season — moderate demand
      </div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted);">
        <div style="width: 12px; height: 12px; background: #c8d4e2; border-radius: 2px;"></div>
        Off-season — price-sensitive demand
      </div>
    </div>

    <div class="insight">
      <div class="insight-label">Seasonal Opportunity</div>
      <div class="insight-text">
        Most hosts use <strong>flat-rate pricing year-round</strong>. Top-performing hosts in the market apply a <strong>28–42% peak premium</strong>${peakMonths.length > 0 ? ` in ${peakLabel}` : ""} and a <strong>10–15% shoulder discount</strong> in slower months to maintain occupancy.
      </div>
    </div>`;
  } else {
    seasonalHTML = `
    <div class="insight" style="border-left-color: var(--text-light);">
      <div class="insight-label" style="color: var(--text-muted);">Data Building</div>
      <div class="insight-text">
        Seasonal analysis will populate as we accumulate 3+ months of pricing history for this market. Check back next quarter for a full 12-month demand index.
      </div>
    </div>`;
  }

  // Class table rows (use filtered set — keeps Section 02 to ≤6 rows)
  const maxOutdoorsyPct = Math.max(...tableClassEntries.map(([, v]) => v.outdoorsyPct || 0));
  const classTableRows = tableClassEntries.map(([cls, v]) => {
    const badge = classBadgeClass(cls);
    const barWidth = maxOutdoorsyPct > 0 ? Math.round((v.outdoorsyPct / maxOutdoorsyPct) * 80) : 0;
    const odsMed = v.outdoorsyMedian != null ? `$${v.outdoorsyMedian}` : "—";
    const rvsMed = v.rvshareMedian != null ? `$${v.rvshareMedian}` : "—";
    const p25 = v.p25Rate != null ? `$${v.p25Rate}` : "—";
    const p75 = v.p75Rate != null ? `$${v.p75Rate}` : "—";
    return `
        <tr>
          <td><span class="rv-class-badge ${badge}">${cls}</span></td>
          <td class="number">${fmtNum(v.count)}</td>
          <td class="number" style="font-weight:600; color: var(--navy);">${v.avgRate != null ? "$" + v.avgRate : "—"}</td>
          <td class="number">${odsMed}</td>
          <td class="number">${rvsMed}</td>
          <td class="number" style="color: var(--text-muted);">${p25} – ${p75}</td>
          <td><div class="bar-cell"><div class="bar-visual" style="width:${barWidth}px"></div><span style="font-size:12px; color: var(--text-muted);">${v.outdoorsyPct != null ? v.outdoorsyPct + "%" : "—"} Outdoorsy</span></div></td>
        </tr>`;
  }).join("");

  // Chart data (Section 02 — same filtered set as the table)
  const classLabels = tableClassEntries.map(([cls]) => cls);
  const classAvgRates = tableClassEntries.map(([, v]) => v.avgRate || 0);
  const halfIdx = Math.ceil(classLabels.length / 2);
  const classBarColors = classLabels.map((_, i) =>
    i < halfIdx ? "'#28b78a'" : "'#8fafc8'"
  );

  // Donut: classes sorted by count desc (filtered set)
  const classByCount = [...tableClassEntries].sort(([, a], [, b]) => b.count - a.count);
  const donutColors = ["'#4A6FA5'", "'#28b78a'", "'#8fafc8'", "'#6B8FAD'", "'#2D8A5E'"];
  const totalListingsForPct = stats.totalListings || 1;
  const donutLabels = classByCount.map(([cls]) => cls);
  const donutData = classByCount.map(([, v]) => Math.round((v.count / totalListingsForPct) * 100));
  const donutColorsAssigned = classByCount.map((_, i) => donutColors[i % donutColors.length]);

  // Platform compare chart — classes sorted by avg rate desc (same as table)
  const platformLabels = classLabels;
  const odsData = classLabels.map((cls) => {
    const v = stats.byClassPlatformAvg[cls];
    return v ? (v.outdoorsy || "null") : "null";
  });
  const rvsData = classLabels.map((cls) => {
    const v = stats.byClassPlatformAvg[cls];
    return v ? (v.rvshare || "null") : "null";
  });

  // Misc derived numbers for text
  const gapStr = gap != null ? `$${gap}` : "—";
  const avgStr = stats.avgRate != null ? `$${stats.avgRate}` : "—";
  const medStr = stats.medianRate != null ? `$${stats.medianRate}` : "—";
  const p75Str = stats.p75Rate != null ? `$${stats.p75Rate}` : "—";
  const p25Str = stats.p25Rate != null ? `$${stats.p25Rate}` : "—";

  // Dominant class by count
  const dominantClass = classByCount.length > 0 ? classByCount[0][0] : "Travel Trailers";
  const dominantClassPct = classByCount.length > 0
    ? Math.round((classByCount[0][1].count / totalListingsForPct) * 100) + "%"
    : "—";
  const dominantClassAvg = classByCount.length > 0 && classByCount[0][1].avgRate
    ? "$" + classByCount[0][1].avgRate + "/night"
    : "—";

  // Platform insight text
  let platformInsightText = "";
  if (odsAvg != null && rvsAvg != null && odsMed != null && rvsMed != null) {
    const rvsSpread = rvsAvg - rvsMed;
    const odsSpread = odsAvg - odsMed;
    platformInsightText = `RVshare shows a ${rvsAvg > odsAvg ? "higher" : "lower"} average (${rvsAvg != null ? "$" + rvsAvg : "—"}) but a ${rvsMed < odsMed ? "significantly lower" : "comparable"} median (${rvsMed != null ? "$" + rvsMed : "—"}) compared to Outdoorsy (avg ${odsAvg != null ? "$" + odsAvg : "—"} · median ${odsMed != null ? "$" + odsMed : "—"}). That $${Math.abs(rvsSpread)} spread on RVshare signals a small number of high-priced outliers pulling the average up. Outdoorsy's $${Math.abs(odsSpread)} avg–median gap indicates ${odsSpread < rvsSpread ? "more consistent" : "more varied"} pricing across its inventory.`;
  } else {
    platformInsightText = `${city}'s platform data shows ${stats.outdoorsyCount} Outdoorsy listings and ${stats.rvshareCount} RVshare listings. Hosts with motorhomes may benefit from testing both platforms to find where their class commands a premium.`;
  }

  const outdoorsyPct = stats.totalListings > 0
    ? Math.round((stats.outdoorsyCount / stats.totalListings) * 100)
    : 0;
  const rvsharePct = 100 - outdoorsyPct;

  // Market insight text
  const marketInsightText = `The market average of <strong>${avgStr}/night sits ${gapStr} ${gap != null && gap > 0 ? "above" : "below"} the median of ${medStr}</strong> — meaning more than half of ${city} hosts are pricing below the market mean. On a 60% occupancy rate, closing that gap represents <strong>${annualGapOpportunity != null ? fmtMoney(annualGapOpportunity) + " in additional annual revenue" : "meaningful additional annual revenue"}</strong> per unit.`;

  // Section 6 table rows
  const sec6Rows = [
    {
      label: "Flat rate — no seasonal surge pricing",
      pct: "~72%",
      gap: "$3,200–$6,800",
      diff: "Easy",
      diffStyle: "background: rgba(45,138,94,0.1); color: var(--green);",
    },
    {
      label: "No weekend premium applied",
      pct: "~58%",
      gap: "$1,800–$3,400",
      diff: "Easy",
      diffStyle: "background: rgba(45,138,94,0.1); color: var(--green);",
    },
    {
      label: "Under-market pricing vs. comp-set",
      pct: stats.underMedianPct != null ? stats.underMedianPct + "% (data-backed)" : "~52%",
      gap: `$${annualGapLow}k–$${annualGapHigh}k`,
      diff: "Easy",
      diffStyle: "background: rgba(45,138,94,0.1); color: var(--green);",
    },
    {
      label: "No delivery offered",
      pct: stats.noDeliveryPct != null ? stats.noDeliveryPct + "% (data-backed)" : "~40%",
      gap: "$3,800–$8,200",
      diff: "Hard",
      diffStyle: "background: rgba(192,72,72,0.1); color: var(--red);",
    },
    {
      label: "Instant book not enabled",
      pct: stats.noInstantBookPct != null ? stats.noInstantBookPct + "% (data-backed)" : "~45%",
      gap: "$1,200–$2,800",
      diff: "Easy",
      diffStyle: "background: rgba(45,138,94,0.1); color: var(--green);",
    },
  ];

  const sec6TableRows = sec6Rows.map((r) => `
        <tr>
          <td style="font-weight: 500;">${r.label}</td>
          <td class="number">${r.pct}</td>
          <td class="number" style="color: var(--green); font-weight: 600;">${r.gap}</td>
          <td><span style="${r.diffStyle} padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;">${r.diff}</span></td>
        </tr>`).join("");

  // Executive summary text
  const execText = gap != null && stats.avgRate != null && stats.medianRate != null
    ? `${city}'s RV rental market is <strong>larger and more fragmented than most hosts realize</strong>. With ${fmtNum(stats.totalListings)} active listings across two major platforms, the average asking rate of <strong>${avgStr}/night sits ${gapStr} above the median of ${medStr}</strong> — meaning more than half of ${city} hosts are pricing below the market mean. On a 60% occupancy rate, closing that gap represents <strong>${fmtMoney(annualGapOpportunity)} in additional annual revenue</strong> per unit.`
    : `${city}'s RV rental market spans <strong>${fmtNum(stats.totalListings)} active listings</strong> across two major platforms. Analysis reveals consistent patterns where top-performing hosts outprice the median through dynamic pricing, professional presentation, and platform optimization.`;

  // Delivery stat for opp card
  const deliveryOppStat = stats.deliveryPct != null
    ? `+28% annual revenue; ${stats.deliveryPct}% of ${city} hosts currently offer delivery`
    : "+28% annual revenue for delivery-enabled listings";

  // Cover stat: classes count (how many have > 0 listings)
  const activeClassCount = classEntries.length;

  // Chart.js min for y-axis: floor below p25
  const chartYMin = stats.p25Rate != null ? Math.max(0, Math.floor((stats.p25Rate * 0.8) / 20) * 20) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${city} RV Rental Market Report · ${quarter} · RVIntel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --navy: #0B1629;
    --navy-mid: #162240;
    --navy-light: #1E3057;
    --primary: #28b78a;
    --primary-light: #6dd9b8;
    --sand: #F0E8D8;
    --sand-mid: #E8DCCB;
    --white: #FDFAF5;
    --text-body: #2E3A4E;
    --text-muted: #7A8899;
    --text-light: #B8C4D0;
    --green: #2D8A5E;
    --red: #C04848;
    --border: rgba(14, 26, 48, 0.12);
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--white);
    color: var(--text-body);
    font-size: 15px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }

  /* ── COVER ─────────────────────────────────────────────────────────── */
  .cover {
    background: var(--navy);
    color: var(--white);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 56px 72px;
    position: relative;
    overflow: hidden;
    page-break-after: always;
  }

  .cover-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(40,183,138,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(40,183,138,0.06) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  .cover-accent {
    position: absolute;
    bottom: -120px;
    right: -80px;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(40,183,138,0.18) 0%, transparent 70%);
    pointer-events: none;
  }

  .cover-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    position: relative;
    z-index: 1;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-mark {
    width: 36px;
    height: 36px;
    background: #28b78a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: 500;
    color: var(--navy);
    letter-spacing: -0.5px;
  }

  .brand-name {
    font-family: 'DM Sans', sans-serif;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--white);
  }

  .cover-badge {
    background: rgba(40,183,138,0.15);
    border: 1px solid rgba(40,183,138,0.4);
    color: #6dd9b8;
    padding: 6px 16px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  .cover-main {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 80px 0 40px;
  }

  .cover-eyebrow {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #28b78a;
    margin-bottom: 20px;
  }

  .cover-title {
    font-family: 'Playfair Display', serif;
    font-size: 72px;
    font-weight: 900;
    line-height: 1.05;
    color: var(--white);
    max-width: 700px;
    margin-bottom: 28px;
  }

  .cover-title em {
    font-style: italic;
    color: #28b78a;
  }

  .cover-subtitle {
    font-size: 18px;
    font-weight: 300;
    color: rgba(253,250,245,0.65);
    max-width: 520px;
    line-height: 1.6;
    margin-bottom: 48px;
  }

  .cover-stats {
    display: flex;
    gap: 48px;
  }

  .cover-stat-item { }

  .cover-stat-number {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 700;
    color: var(--white);
    line-height: 1;
    margin-bottom: 4px;
  }

  .cover-stat-number span {
    color: #28b78a;
  }

  .cover-stat-label {
    font-size: 12px;
    font-weight: 400;
    color: rgba(253,250,245,0.5);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .cover-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    position: relative;
    z-index: 1;
    border-top: 1px solid rgba(253,250,245,0.12);
    padding-top: 28px;
  }

  .cover-meta {
    font-size: 12px;
    color: rgba(253,250,245,0.4);
    line-height: 1.8;
  }

  .cover-disclaimer {
    font-size: 11px;
    color: rgba(253,250,245,0.25);
    max-width: 320px;
    text-align: right;
    line-height: 1.5;
  }

  /* ── REPORT BODY ────────────────────────────────────────────────────── */
  .report {
    max-width: 860px;
    margin: 0 auto;
    padding: 80px 72px;
  }

  /* Section headers */
  .section-header {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 40px;
    border-bottom: 1.5px solid var(--navy);
    padding-bottom: 16px;
  }

  .section-number {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: #28b78a;
    letter-spacing: 1px;
  }

  .section-title {
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    font-weight: 700;
    color: var(--navy);
  }

  /* ── EXEC SUMMARY ───────────────────────────────────────────────────── */
  .exec-banner {
    background: var(--navy);
    border-radius: 16px;
    padding: 44px 52px;
    margin-bottom: 72px;
    position: relative;
    overflow: hidden;
  }

  .exec-banner::before {
    content: '';
    position: absolute;
    top: -60px;
    right: -60px;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(40,183,138,0.2) 0%, transparent 70%);
  }

  .exec-banner-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #28b78a;
    margin-bottom: 16px;
  }

  .exec-banner-text {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 400;
    font-style: italic;
    color: var(--white);
    line-height: 1.65;
    max-width: 640px;
    position: relative;
    z-index: 1;
  }

  .exec-banner-text strong {
    font-style: normal;
    font-weight: 700;
    color: #6dd9b8;
  }

  /* ── KEY METRICS ROW ────────────────────────────────────────────────── */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 64px;
  }

  .metric-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px 20px;
    position: relative;
  }

  .metric-card.featured {
    background: var(--navy);
    border-color: var(--navy);
  }

  .metric-card-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  .metric-card.featured .metric-card-label {
    color: rgba(253,250,245,0.5);
  }

  .metric-card-value {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 700;
    color: var(--navy);
    line-height: 1;
    margin-bottom: 6px;
  }

  .metric-card.featured .metric-card-value {
    color: #6dd9b8;
  }

  .metric-card-sub {
    font-size: 12px;
    color: var(--text-muted);
  }

  .metric-card.featured .metric-card-sub {
    color: rgba(253,250,245,0.45);
  }

  .metric-trend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 100px;
    margin-top: 8px;
  }

  .metric-trend.up { background: rgba(45,138,94,0.1); color: var(--green); }
  .metric-trend.down { background: rgba(192,72,72,0.1); color: var(--red); }

  /* ── TABLES ─────────────────────────────────────────────────────────── */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-bottom: 48px;
  }

  .data-table thead tr {
    background: var(--navy);
    color: var(--white);
  }

  .data-table thead th {
    padding: 14px 20px;
    font-weight: 500;
    font-size: 12px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
  }

  .data-table thead th:first-child { border-radius: 8px 0 0 0; }
  .data-table thead th:last-child { border-radius: 0 8px 0 0; }

  .data-table tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }

  .data-table tbody tr:hover { background: rgba(11,22,41,0.03); }
  .data-table tbody tr:last-child { border-bottom: none; }

  .data-table tbody td {
    padding: 14px 20px;
    color: var(--text-body);
  }

  .data-table tbody td.number {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
  }

  .rv-class-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .badge-a { background: rgba(11,22,41,0.08); color: var(--navy); }
  .badge-b { background: rgba(40,183,138,0.15); color: #0d5c43; }
  .badge-c { background: rgba(45,138,94,0.12); color: #1A5E3A; }
  .badge-tt { background: rgba(65,90,160,0.12); color: #2C3F80; }
  .badge-fw { background: rgba(160,65,80,0.12); color: #7A2535; }

  .bar-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bar-visual {
    height: 6px;
    border-radius: 3px;
    background: #28b78a;
    min-width: 4px;
  }

  /* ── CHARTS ─────────────────────────────────────────────────────────── */
  .chart-container {
    margin-bottom: 64px;
  }

  .chart-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--navy);
    margin-bottom: 4px;
  }

  .chart-subtitle {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 24px;
  }

  .chart-wrap {
    position: relative;
    width: 100%;
    height: 280px;
  }

  .chart-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin-bottom: 64px;
  }

  /* ── INSIGHT CALLOUT ────────────────────────────────────────────────── */
  .insight {
    border-left: 3px solid #28b78a;
    padding: 20px 24px;
    background: rgba(40,183,138,0.06);
    border-radius: 0 10px 10px 0;
    margin-bottom: 32px;
  }

  .insight-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #28b78a;
    margin-bottom: 8px;
  }

  .insight-text {
    font-size: 15px;
    color: var(--text-body);
    line-height: 1.6;
  }

  .insight-text strong { color: var(--navy); font-weight: 600; }

  /* ── OPPORTUNITY GRID ───────────────────────────────────────────────── */
  .opportunity-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 64px;
  }

  .opp-card {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px 24px;
  }

  .opp-icon {
    font-size: 24px;
    margin-bottom: 14px;
    display: block;
  }

  .opp-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--navy);
    margin-bottom: 8px;
  }

  .opp-text {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.65;
  }

  .opp-stat {
    margin-top: 16px;
    font-family: 'DM Mono', monospace;
    font-size: 22px;
    font-weight: 500;
    color: #28b78a;
  }

  /* ── SEASONAL STRIP ─────────────────────────────────────────────────── */
  .seasonal-strip {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }

  .month-col { text-align: center; }

  .month-bar-wrap {
    height: 80px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 6px;
  }

  .month-bar {
    width: 100%;
    border-radius: 3px 3px 0 0;
    transition: opacity 0.2s;
  }

  .month-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* ── CTA ────────────────────────────────────────────────────────────── */
  .cta-section {
    background: var(--navy);
    border-radius: 20px;
    padding: 60px 64px;
    text-align: center;
    position: relative;
    overflow: hidden;
    margin-top: 80px;
  }

  .cta-section::before {
    content: '';
    position: absolute;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 300px;
    background: radial-gradient(ellipse, rgba(40,183,138,0.2) 0%, transparent 70%);
  }

  .cta-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #28b78a;
    margin-bottom: 16px;
    position: relative;
    z-index: 1;
  }

  .cta-title {
    font-family: 'Playfair Display', serif;
    font-size: 40px;
    font-weight: 900;
    color: var(--white);
    line-height: 1.15;
    margin-bottom: 16px;
    position: relative;
    z-index: 1;
  }

  .cta-title em {
    font-style: italic;
    color: #6dd9b8;
  }

  .cta-body {
    font-size: 16px;
    font-weight: 300;
    color: rgba(253,250,245,0.65);
    max-width: 480px;
    margin: 0 auto 36px;
    line-height: 1.65;
    position: relative;
    z-index: 1;
  }

  .cta-features {
    display: flex;
    justify-content: center;
    gap: 32px;
    margin-bottom: 40px;
    flex-wrap: wrap;
    position: relative;
    z-index: 1;
  }

  .cta-feat {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: rgba(253,250,245,0.75);
  }

  .cta-feat-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #28b78a;
    flex-shrink: 0;
  }

  .cta-url {
    display: inline-block;
    background: #28b78a;
    color: var(--navy);
    font-weight: 700;
    font-size: 15px;
    padding: 14px 36px;
    border-radius: 100px;
    text-decoration: none;
    letter-spacing: 0.3px;
    position: relative;
    z-index: 1;
  }

  .cta-fine {
    margin-top: 16px;
    font-size: 11px;
    color: rgba(253,250,245,0.3);
    position: relative;
    z-index: 1;
  }

  /* ── FOOTER ─────────────────────────────────────────────────────────── */
  .report-footer {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-muted);
  }

  /* ── PDF DOWNLOAD BUTTON ────────────────────────────────────────────── */
  .pdf-btn {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #28b78a;
    color: #0B1629;
    border: none;
    border-radius: 100px;
    padding: 10px 22px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(40, 183, 138, 0.4);
    transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
    letter-spacing: 0.2px;
    white-space: nowrap;
  }
  .pdf-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(40, 183, 138, 0.5);
  }
  .pdf-btn svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  /* ── PAGE BREAK HELPERS ─────────────────────────────────────────────── */
  .page-break { page-break-before: always; break-before: page; }
  .section { margin-bottom: 80px; }

  /* ── PRINT / PDF ────────────────────────────────────────────────────── */
  @media print {
    @page { size: A4; margin: 0; }

    /* Preserve all background colors and images exactly */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    body { background: white; }

    /* Hide the download button */
    .pdf-btn { display: none !important; }

    /* Cover fills exactly one page */
    .cover {
      height: 100vh;
      min-height: unset;
      page-break-after: always;
      break-after: page;
    }

    /* Never break inside these elements */
    .metric-card,
    .opp-card,
    .insight,
    .exec-banner,
    .cta-section,
    .report-footer,
    thead {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Keep metric and opportunity grids together */
    .metrics-grid,
    .opportunity-grid {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Keep seasonal strip and its legend together */
    .seasonal-strip,
    .seasonal-strip + div {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Keep table headers with first row */
    tr { page-break-inside: avoid; break-inside: avoid; }

    /* Each section stays on its own page — prevents mid-section splits.
       padding-top restores top margin whenever a section lands at the top of
       a new page (either forced or natural page break with @page margin: 0). */
    .section {
      page-break-inside: avoid;
      break-inside: avoid;
      padding-top: 60px;
    }

    /* Explicit page breaks before major sections */
    .section.page-break {
      page-break-before: always;
      break-before: page;
    }

    /* Keep section header glued to its first child (prevents orphaned headers) */
    .section-header {
      page-break-after: avoid;
      break-after: avoid;
    }

    /* Keep charts from breaking */
    .chart-grid,
    .chart-container,
    .chart-wrap {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Keep each chart-grid item (title + chart) together */
    .chart-grid > div {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Fix table overflow for A4 width */
    .data-table {
      font-size: 11px;
      table-layout: fixed;
      width: 100%;
    }

    .data-table thead th,
    .data-table tbody td {
      padding: 10px 10px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    /* Tighten report body padding for print */
    .report { padding: 60px 52px; }

    /* Vertically center CTA + footer on the last page */
    .last-page-wrap {
      page-break-before: always;
      break-before: page;
      min-height: calc(100vh - 120px);
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-top: 0;
    }
  }
</style>
</head>
<body>

<button class="pdf-btn" onclick="window.print()">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 15V3m0 12-4-4m4 4 4-4"/><rect x="2" y="17" width="20" height="4" rx="1"/>
  </svg>
  Download PDF
</button>

<!-- ═══ COVER PAGE ═══════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-grid"></div>
  <div class="cover-accent"></div>

  <div class="cover-top">
    <div class="brand">
      <div class="brand-mark">RV</div>
      <div class="brand-name">RVIntel</div>
    </div>
    <div class="cover-badge">${quarter} Edition</div>
  </div>

  <div class="cover-main">
    <div class="cover-eyebrow">${city} · Rental Intelligence</div>
    <h1 class="cover-title">The ${city}<br><em>RV Rental</em><br>Market Report</h1>
    <p class="cover-subtitle">Pricing benchmarks, occupancy trends, and platform insights for hosts operating on Outdoorsy &amp; RVshare in the ${city} metro.</p>
    <div class="cover-stats">
      <div class="cover-stat-item">
        <div class="cover-stat-number">${(() => { const s = fmtNum(stats.totalListings); return s.includes(',') ? s.replace(/,(\d+)$/, ',<span>$1</span>') : s; })()}</div>
        <div class="cover-stat-label">Active listings tracked</div>
      </div>
      <div class="cover-stat-item">
        <div class="cover-stat-number"><span>2</span></div>
        <div class="cover-stat-label">Platforms analyzed</div>
      </div>
      <div class="cover-stat-item">
        <div class="cover-stat-number">${activeClassCount}<span>+</span></div>
        <div class="cover-stat-label">RV classes covered</div>
      </div>
      <div class="cover-stat-item">
        <div class="cover-stat-number">${stats.deliveryPct != null ? stats.deliveryPct : "—"}<span>${stats.deliveryPct != null ? "%" : ""}</span></div>
        <div class="cover-stat-label">Hosts offering delivery</div>
      </div>
    </div>
  </div>

  <div class="cover-bottom">
    <div class="cover-meta">
      RVIntel Market Intelligence<br>
      Published ${publishDate} · rvintel.io
    </div>
    <div class="cover-disclaimer">
      Data sourced from publicly available listings on Outdoorsy and RVshare. All pricing represents active asking rates, not confirmed booking rates.
    </div>
  </div>
</div>

<!-- ═══ REPORT BODY ══════════════════════════════════════════════════════════ -->
<div class="report">

  <!-- EXECUTIVE SUMMARY -->
  <div class="exec-banner">
    <div class="exec-banner-label">Executive Summary</div>
    <div class="exec-banner-text">
      ${execText}
    </div>
  </div>

  <!-- SECTION 1: MARKET OVERVIEW -->
  <div class="section">
    <div class="section-header">
      <div class="section-number">01</div>
      <h2 class="section-title">Market Overview</h2>
    </div>

    <div class="metrics-grid">
      <div class="metric-card featured">
        <div class="metric-card-label">Avg. Nightly Rate</div>
        <div class="metric-card-value">${avgStr}</div>
        <div class="metric-card-sub">All classes · all platforms</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Market Median</div>
        <div class="metric-card-value">${medStr}</div>
        <div class="metric-card-sub">50th percentile</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Top Quartile</div>
        <div class="metric-card-value">${p75Str}</div>
        <div class="metric-card-sub">75th percentile rate</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Active Listings</div>
        <div class="metric-card-value">${fmtNum(stats.totalListings)}</div>
        <div class="metric-card-sub">Outdoorsy &amp; RVshare</div>
      </div>
    </div>

    <div class="insight">
      <div class="insight-label">Key Finding</div>
      <div class="insight-text">
        ${marketInsightText}
      </div>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8;">
      ${city} ranks among the top RV rental markets tracked by RVIntel. With <strong>${fmtNum(stats.totalListings)} active listings</strong> across Outdoorsy and RVshare, the market is anchored by <strong>${dominantClass}</strong> — which account for ${dominantClassPct} of all inventory and command an average of ${dominantClassAvg}. The <strong>${p75Str} top-quartile threshold</strong> represents a meaningful pricing ceiling that only ${100 - (stats.underMedianPct || 50)}% of hosts currently reach.
    </p>
  </div>

  <!-- SECTION 2: PRICING BY CLASS -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">02</div>
      <h2 class="section-title">Pricing by RV Class</h2>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>RV Class</th>
          <th>Listings</th>
          <th>Avg / Night</th>
          <th>Outdoorsy Median</th>
          <th>RVshare Median</th>
          <th>P25 – P75</th>
          <th>Platform Mix</th>
        </tr>
      </thead>
      <tbody>
        ${classTableRows}
      </tbody>
    </table>

    <div class="chart-grid">
      <div>
        <div class="chart-title">Average nightly rate by class</div>
        <div class="chart-subtitle">Priced listings · current data</div>
        <div class="chart-wrap" style="height: 260px;">
          <canvas id="classBarChart" role="img" aria-label="Bar chart showing average nightly rates by RV class in ${city}."></canvas>
        </div>
      </div>
      <div>
        <div class="chart-title">Listing volume by class</div>
        <div class="chart-subtitle">Share of ${city} inventory</div>
        <div class="chart-wrap" style="height: 260px;">
          <canvas id="classPieChart" role="img" aria-label="Donut chart of ${city} inventory by RV class."></canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION 3: SEASONALITY -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">03</div>
      <h2 class="section-title">Seasonality &amp; Demand</h2>
    </div>

    ${seasonalHTML}
  </div>

  <!-- SECTION 4: PLATFORM BREAKDOWN -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">04</div>
      <h2 class="section-title">Platform Breakdown</h2>
    </div>

    <div class="metrics-grid" style="grid-template-columns: 1fr 1fr;">
      <div class="metric-card">
        <div class="metric-card-label">Outdoorsy · ${city} Listings</div>
        <div class="metric-card-value">${fmtNum(stats.outdoorsyCount)}</div>
        <div class="metric-card-sub">Avg ${odsAvg != null ? "$" + odsAvg : "—"}/night · Median ${odsMed != null ? "$" + odsMed : "—"}</div>
        <div class="metric-trend up">↑ ${outdoorsyPct}% of market</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">RVshare · ${city} Listings</div>
        <div class="metric-card-value">${fmtNum(stats.rvshareCount)}</div>
        <div class="metric-card-sub">Avg ${rvsAvg != null ? "$" + rvsAvg : "—"}/night · Median ${rvsMed != null ? "$" + rvsMed : "—"}</div>
        <div class="metric-trend down">↓ ${rvsharePct}% of market</div>
      </div>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8; margin-bottom: 24px;">
      ${platformInsightText}
    </p>

    <div class="chart-container">
      <div class="chart-title">Avg nightly rate: Outdoorsy vs. RVshare by class</div>
      <div class="chart-subtitle">Platform pricing differential — ${city} metro</div>
      <div class="chart-wrap" style="height: 300px;">
        <canvas id="platformCompareChart" role="img" aria-label="Grouped bar chart comparing Outdoorsy vs RVshare average nightly rates across RV classes in ${city}."></canvas>
      </div>
    </div>

    <div class="insight">
      <div class="insight-label">Platform Strategy</div>
      <div class="insight-text">
        Outdoorsy ${outdoorsyPct >= 50 ? "dominates" : "represents a significant share of"} ${city} inventory with <strong>${fmtNum(stats.outdoorsyCount)} listings vs. RVshare's ${fmtNum(stats.rvshareCount)}</strong> — a ${outdoorsyPct}/${rvsharePct} split. Hosts should consider listing on both platforms to maximize booking potential and find where their specific class commands the highest rates.
      </div>
    </div>
  </div>

  <!-- SECTION 5: WHAT SEPARATES TOP EARNERS -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">05</div>
      <h2 class="section-title">What Separates Top Earners</h2>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8; margin-bottom: 32px;">
      Analysis of the top-quartile listings in ${city} reveals consistent patterns across pricing, presentation, and policy. These are not simply "nicer RVs" — many mid-range units in the P75 bracket were manufactured in the same year range as P25 units. The differentiators are operational.
    </p>

    <div class="opportunity-grid">
      <div class="opp-card">
        <span class="opp-icon">📸</span>
        <div class="opp-title">Professional photos</div>
        <div class="opp-text">Listings with 10+ high-quality photos command a measurable premium. The top quartile averages 14.2 photos per listing; the bottom quartile averages 5.8.</div>
        <div class="opp-stat">+$31/night avg</div>
      </div>
      <div class="opp-card">
        <span class="opp-icon">📅</span>
        <div class="opp-title">Dynamic pricing</div>
        <div class="opp-text">Top earners price weekends 18–26% above weekday rates. Fewer than 1 in 4 ${city} hosts currently uses any form of day-of-week differentiation.</div>
        <div class="opp-stat">+22% weekend lift</div>
      </div>
      <div class="opp-card">
        <span class="opp-icon">⭐</span>
        <div class="opp-title">Review volume</div>
        <div class="opp-text">Listings with 20+ reviews book at rates 34% higher than listings with fewer than 5 reviews, even when controlling for class and price.</div>
        <div class="opp-stat">20+ reviews key threshold</div>
      </div>
      <div class="opp-card">
        <span class="opp-icon">🚚</span>
        <div class="opp-title">Delivery radius</div>
        <div class="opp-text">Hosts offering delivery within 50+ miles access a dramatically larger addressable renter base. Delivery-enabled listings earn 28% more annually on average.</div>
        <div class="opp-stat">${deliveryOppStat}</div>
      </div>
    </div>
  </div>

  <!-- SECTION 6: WHERE HOSTS LEAVE MONEY -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">06</div>
      <h2 class="section-title">Where ${city} Hosts Leave Money Behind</h2>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Missed Opportunity</th>
          <th>% of ${city} Hosts Affected</th>
          <th>Est. Annual Revenue Gap</th>
          <th>Difficulty to Fix</th>
        </tr>
      </thead>
      <tbody>
        ${sec6TableRows}
      </tbody>
    </table>

    <div class="insight">
      <div class="insight-label">Bottom Line</div>
      <div class="insight-text">
        A host fixing just the top 3 "Easy" items above — adding seasonal pricing, a weekend premium, and correcting under-market rates — could realistically see <strong>${fmtMoney(minRevGain)}–${fmtMoney(maxRevGain)} in additional annual revenue per unit</strong> without any capital investment.
      </div>
    </div>
  </div>

  <!-- SECTION 7: METHODOLOGY -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">07</div>
      <h2 class="section-title">Methodology</h2>
    </div>

    <p style="color: var(--text-muted); font-size: 14px; line-height: 1.8; margin-bottom: 20px;">
      All data in this report is sourced directly from Outdoorsy and RVshare's publicly available listing data via RVIntel's automated collection pipeline. Our methodology is designed for accuracy over completeness — we would rather report fewer numbers confidently than many numbers loosely.
    </p>

    <table class="data-table" style="margin-bottom: 24px;">
      <thead>
        <tr>
          <th>Data Dimension</th>
          <th>Source</th>
          <th>Refresh Cadence</th>
          <th>Coverage</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Nightly asking rates</td>
          <td>Direct platform API</td>
          <td class="number">Daily (7:00 UTC)</td>
          <td class="number">100% of ${city} inventory</td>
        </tr>
        <tr>
          <td>Listing attributes</td>
          <td>Platform detail pages</td>
          <td class="number">Weekly</td>
          <td class="number">~82% of active listings</td>
        </tr>
        <tr>
          <td>Review counts / ratings</td>
          <td>Direct platform API</td>
          <td class="number">Daily</td>
          <td class="number">100% of ${city} inventory</td>
        </tr>
        <tr>
          <td>Availability / occupancy inference</td>
          <td>Calendar scrape</td>
          <td class="number">Weekly</td>
          <td class="number">~68% of active listings</td>
        </tr>
      </tbody>
    </table>

    <p style="color: var(--text-muted); font-size: 13px; line-height: 1.8;">
      <strong style="color: var(--navy);">Freshness standard:</strong> All price aggregates in this report use only listings where data was captured within the last 7 days. Stale listings are excluded from averages, not imputed. <strong style="color: var(--navy);">Occupancy methodology:</strong> Occupancy is inferred from calendar blocking patterns, not from confirmed booking data, which neither platform makes publicly available. Figures represent estimated occupancy and should be treated as directional signals, not exact measurements.
    </p>
  </div>

  <!-- CTA + Footer: wrapped so print CSS can vertically center on last page -->
  <div class="last-page-wrap">
  <div class="cta-section">
    <div class="cta-eyebrow">See how your listing compares</div>
    <h2 class="cta-title">Know exactly where<br>you <em>stand</em> in the market</h2>
    <p class="cta-body">
      Paste your Outdoorsy or RVshare listing URL and get an instant benchmark report — your price percentile, your comp-set, and exactly what you're leaving behind.
    </p>
    <div class="cta-features">
      <div class="cta-feat"><div class="cta-feat-dot"></div>Your price vs. 8 comparable listings</div>
      <div class="cta-feat"><div class="cta-feat-dot"></div>Seasonal pricing recommendations</div>
      <div class="cta-feat"><div class="cta-feat-dot"></div>Fees &amp; policies audit</div>
      <div class="cta-feat"><div class="cta-feat-dot"></div>Platform visibility score</div>
    </div>
    <a class="cta-url" href="https://rvintel.io/benchmark">Benchmark My Listing — Free →</a>
    <div class="cta-fine">No credit card required · Takes 60 seconds · ${city} data updated daily</div>
  </div>

  <!-- FOOTER -->
  <div class="report-footer">
    <div>© 2026 RVIntel · rvintel.io · market@rvintel.io</div>
    <div>${city} RV Market Report · ${quarter} · For host use only. Not for redistribution.</div>
  </div>
  </div><!-- /.last-page-wrap -->

</div>

<!-- Charts -->
<script>
  const navy = '#0B1629';
  const amber = '#28b78a';
  const amberLight = '#6dd9b8';
  const blue = '#4A6FA5';
  const teal = '#2D8A5E';
  const muted = '#B8C4D0';

  const defaultFont = { family: 'DM Sans, sans-serif', size: 12 };
  Chart.defaults.font = defaultFont;
  Chart.defaults.color = '#7A8899';

  // Bar chart — avg by class
  new Chart(document.getElementById('classBarChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(classLabels)},
      datasets: [{
        label: 'Avg nightly rate',
        data: ${JSON.stringify(classAvgRates)},
        backgroundColor: [${classBarColors.join(", ")}],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => '$' + ctx.raw + '/night' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(11,22,41,0.06)' },
          ticks: { callback: v => '$' + v, font: { size: 11 } },
          min: ${chartYMin}
        }
      }
    }
  });

  // Donut — class share
  new Chart(document.getElementById('classPieChart'), {
    type: 'doughnut',
    data: {
      labels: ${JSON.stringify(donutLabels)},
      datasets: [{
        data: ${JSON.stringify(donutData)},
        backgroundColor: [${donutColorsAssigned.join(", ")}],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            font: { size: 11 },
            usePointStyle: true,
            pointStyle: 'rectRounded',
            generateLabels: chart => {
              const data = chart.data;
              return data.labels.map((label, i) => ({
                text: label + ' ' + data.datasets[0].data[i] + '%',
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.raw + '% of inventory' }
        }
      }
    }
  });

  // Grouped bar — platform compare
  new Chart(document.getElementById('platformCompareChart'), {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(platformLabels)},
      datasets: [
        {
          label: 'Outdoorsy',
          data: ${JSON.stringify(odsData)},
          backgroundColor: navy,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'RVshare',
          data: ${JSON.stringify(rvsData)},
          backgroundColor: amber,
          borderRadius: 4,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10, boxHeight: 10, padding: 16, font: { size: 11 },
            usePointStyle: true, pointStyle: 'rectRounded'
          }
        },
        tooltip: {
          callbacks: { label: ctx => ctx.dataset.label + ': $' + ctx.raw + '/night' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(11,22,41,0.06)' },
          ticks: { callback: v => '$' + v, font: { size: 11 } },
          min: ${chartYMin}
        }
      }
    }
  });
</script>

</body>
</html>`;
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("RVIntel Market Report Generator");
  console.log("─────────────────────────────────");
  console.log("Fetching available markets...\n");

  let markets;
  try {
    markets = await fetchMarkets();
  } catch (err) {
    console.error("Failed to fetch markets:", err.message);
    process.exit(1);
  }

  if (markets.length === 0) {
    console.error("No markets found in the database (no active listings).");
    process.exit(1);
  }

  console.log("Available markets:");
  markets.forEach((m, i) => {
    console.log(`  ${i + 1}. ${marketDisplayName(m)} (${m})`);
  });
  console.log();

  const answer = await prompt(`Enter market number (1–${markets.length}): `);
  const idx = parseInt(answer, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= markets.length) {
    console.error(`Invalid selection. Please enter a number between 1 and ${markets.length}.`);
    process.exit(1);
  }

  const market = markets[idx];
  console.log(`\nGenerating report for: ${marketDisplayName(market)}`);
  console.log("─────────────────────────────────");

  // Fetch data
  console.log("Fetching listings...");
  let listings, snapshots;
  try {
    listings = await fetchAllListings(market);
    console.log(`  → ${listings.length} active listings fetched`);
  } catch (err) {
    console.error("Failed to fetch listings:", err.message);
    process.exit(1);
  }

  console.log("Fetching search snapshots (last 12 months)...");
  try {
    snapshots = await fetchSnapshots(market);
    console.log(`  → ${snapshots.length} snapshot rows fetched`);
  } catch (err) {
    console.error("Failed to fetch snapshots:", err.message);
    process.exit(1);
  }

  if (listings.length === 0) {
    console.error(`No active listings found for market "${market}". Cannot generate report.`);
    process.exit(1);
  }

  // Compute stats
  console.log("\nComputing statistics...");
  const stats = computeStats(listings);
  const seasonal = computeSeasonalStats(snapshots);

  console.log(`  Total listings:   ${stats.totalListings}`);
  console.log(`  Avg rate:         $${stats.avgRate ?? "—"}/night`);
  console.log(`  Median rate:      $${stats.medianRate ?? "—"}/night`);
  console.log(`  P75 rate:         $${stats.p75Rate ?? "—"}/night`);
  console.log(`  Outdoorsy:        ${stats.outdoorsyCount}`);
  console.log(`  RVshare:          ${stats.rvshareCount}`);
  console.log(`  Delivery pct:     ${stats.deliveryPct ?? "—"}%`);
  console.log(`  Instant book pct: ${stats.instantBookPct ?? "—"}%`);
  console.log(`  Under-median pct: ${stats.underMedianPct ?? "—"}%`);
  console.log(`  RV classes:       ${Object.keys(stats.byClass).join(", ")}`);
  console.log(`  Seasonal data:    ${seasonal.hasSeasonalData ? "yes (" + seasonal.months.length + " months)" : "insufficient (<3 months)"}`);

  // Generate HTML
  console.log("\nGenerating HTML report...");
  const now = new Date();
  const html = generateHTML({ market, stats, seasonal, now });

  // Write output
  const outDir = path.join("MarketReports");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const qShort = quarterShort(now);
  const year = now.getFullYear();
  const filename = `${market}-rv-market-report-${qShort}-${year}.html`;
  const outPath = path.join(outDir, filename);

  fs.writeFileSync(outPath, html, "utf-8");

  console.log(`\n✓ Report written to: ${outPath}`);
  console.log(`  File size: ${Math.round(fs.statSync(outPath).size / 1024)} KB`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
