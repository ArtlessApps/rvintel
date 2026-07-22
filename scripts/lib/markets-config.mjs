import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const marketsTs = fs.readFileSync(path.join(ROOT, "lib/markets.ts"), "utf-8");

/**
 * @typedef {{
 *   slug: string,
 *   displayName: string,
 *   region: string,
 *   radiusMiles: number,
 *   outdoorsyAddress: string|null,
 *   rvshareLocation: string|null,
 * }} LiveMarket
 */

/** @returns {Map<string, LiveMarket>} */
export function loadMarkets() {
  const blocks = marketsTs.split(/\{\s*\n\s*slug:/).slice(1);
  const map = new Map();
  for (const block of blocks) {
    const slug = block.match(/^\s*"([^"]+)"/)?.[1];
    const displayName = block.match(/displayName:\s*"([^"]+)"/)?.[1];
    const region = block.match(/region:\s*"([^"]+)"/)?.[1] ?? "";
    const radiusMiles = Number(block.match(/radiusMiles:\s*(\d+)/)?.[1] ?? 35);
    const outdoorsy = block.match(/outdoorsyAddress:\s*(null|"([^"]*)")/)?.[2] ?? null;
    const rvshare = block.match(/rvshareLocation:\s*(null|"([^"]*)")/)?.[2] ?? null;
    const isLive = block.match(/isLive:\s*(true|false)/)?.[1] === "true";
    if (slug && isLive) {
      map.set(slug, {
        slug,
        displayName: displayName ?? slug,
        region,
        radiusMiles,
        outdoorsyAddress: outdoorsy,
        rvshareLocation: rvshare,
      });
    }
  }
  return map;
}

/** @returns {LiveMarket[]} */
export function liveMarketList() {
  return [...loadMarkets().values()];
}

/** Markets listed for expansion bootstrap (excludes 4 original live anchors). */
export const EXPANSION_SLUGS = [
  "los-angeles-ca",
  "long-beach-ca",
  "sacramento-ca",
  "san-francisco-ca",
  "san-jose-ca",
  "denver-co",
  "salt-lake-city-ut",
  "reno-nv",
  "cheyenne-wy",
  "phoenix-az",
  "austin-tx",
  "san-antonio-tx",
  "dallas-fort-worth-tx",
  "orlando-fl",
  "tampa-fl",
  "atlanta-ga",
  "chattanooga-tn",
  "columbus-oh",
  "cincinnati-oh",
  "detroit-mi",
  "grand-rapids-mi",
  "madison-wi",
  "milwaukee-wi",
  "philadelphia-pa",
  "baltimore-md",
  "new-york-ny",
  "washington-dc",
  "harrisburg-pa",
  "seattle-wa",
];

export function discoverySlugs(slugs = EXPANSION_SLUGS) {
  const markets = loadMarkets();
  return slugs.filter((slug) => {
    const m = markets.get(slug);
    return m?.outdoorsyAddress && m?.rvshareLocation;
  });
}

export function getMarket(slug) {
  const m = loadMarkets().get(slug);
  if (!m) throw new Error(`Unknown market slug: ${slug}`);
  return m;
}
