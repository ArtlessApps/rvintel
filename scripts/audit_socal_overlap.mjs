#!/usr/bin/env node
// SoCal overlap audit — Riverside vs LA vs Long Beach listing URL intersection.
//
// Uses listings_in_market RPC (requires migration 012). Reports Jaccard similarity.
//
// Usage: node scripts/audit_socal_overlap.mjs

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").trim();
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const MARKETS = [
  "riverside-county-ca",
  "los-angeles-ca",
  "long-beach-ca",
];

/** Fallback when migration 012 RPC is not yet applied */
const MARKET_GEO = {
  "riverside-county-ca": { lat: 33.9533, lng: -117.3962, radius: 45 },
  "los-angeles-ca": { lat: 34.0522, lng: -118.2437, radius: 40 },
  "long-beach-ca": { lat: 33.7701, lng: -118.1937, radius: 25 },
};

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchUrlsFallback(marketSlug) {
  const geo = MARKET_GEO[marketSlug];
  const PAGE = 1000;
  const urls = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("listings")
      .select("listing_url, location_lat, location_lng")
      .eq("is_active", true)
      .not("location_lat", "is", null)
      .not("location_lng", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${marketSlug}: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      const dist = haversineMiles(
        Number(row.location_lat),
        Number(row.location_lng),
        geo.lat,
        geo.lng,
      );
      if (dist <= geo.radius && row.listing_url) {
        urls.add(row.listing_url.toLowerCase());
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return urls;
}

let useRpc = true;

async function fetchUrls(marketSlug) {
  if (!useRpc) return fetchUrlsFallback(marketSlug);

  const PAGE = 1000;
  const urls = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .rpc("listings_in_market", {
        p_market_slug: marketSlug,
        p_rv_class: null,
        p_active_only: true,
      })
      .select("listing_url")
      .range(from, from + PAGE - 1);
    if (error) {
      if (error.message.includes("listings_in_market")) {
        console.log("\n(RPC unavailable — using client-side haversine fallback)\n");
        useRpc = false;
        return fetchUrlsFallback(marketSlug);
      }
      throw new Error(`${marketSlug}: ${error.message}`);
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.listing_url) urls.add(row.listing_url.toLowerCase());
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return urls;
}

function jaccard(a, b) {
  const inter = [...a].filter((u) => b.has(u)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

function pairReport(nameA, setA, nameB, setB) {
  const inter = [...setA].filter((u) => setB.has(u)).length;
  const onlyA = setA.size - inter;
  const onlyB = setB.size - inter;
  const jac = jaccard(setA, setB);
  console.log(`\n── ${nameA} vs ${nameB} ──`);
  console.log(`  |${nameA}|        ${setA.size}`);
  console.log(`  |${nameB}|        ${setB.size}`);
  console.log(`  |intersection|  ${inter}`);
  console.log(`  |${nameA} only|   ${onlyA}`);
  console.log(`  |${nameB} only|   ${onlyB}`);
  console.log(`  Jaccard         ${(jac * 100).toFixed(1)}%`);
}

async function main() {
  console.log("SoCal geo market overlap audit\n");

  const sets = {};
  for (const slug of MARKETS) {
    process.stdout.write(`Fetching ${slug}...`);
    sets[slug] = await fetchUrls(slug);
    console.log(` ${sets[slug].size} listings`);
  }

  pairReport("riverside", sets["riverside-county-ca"], "LA", sets["los-angeles-ca"]);
  pairReport("riverside", sets["riverside-county-ca"], "long-beach", sets["long-beach-ca"]);
  pairReport("LA", sets["los-angeles-ca"], "long-beach", sets["long-beach-ca"]);

  console.log("\nHigh overlap is expected and fine — each market is an independent geo window.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
