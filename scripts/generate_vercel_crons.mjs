#!/usr/bin/env node
// Regenerate vercel.json crons from lib/markets.ts discovery anchors.
//
// Usage: node scripts/generate_vercel_crons.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const marketsTs = fs.readFileSync(path.join(ROOT, "lib/markets.ts"), "utf-8");

/** Parse discovery slugs: isLive markets with both outdoorsy + rvshare anchors */
function parseDiscoverySlugs() {
  const blocks = marketsTs.split(/\{\s*\n\s*slug:/).slice(1);
  const slugs = [];
  for (const block of blocks) {
    const slug = block.match(/^\s*"([^"]+)"/)?.[1];
    const outdoorsy = block.match(/outdoorsyAddress:\s*(null|"[^"]+")/)?.[1];
    const rvshare = block.match(/rvshareLocation:\s*(null|"[^"]+")/)?.[1];
    const isLive = block.match(/isLive:\s*(true|false)/)?.[1] === "true";
    if (slug && isLive && outdoorsy && outdoorsy !== "null" && rvshare && rvshare !== "null") {
      slugs.push(slug);
    }
  }
  return slugs.sort((a, b) => {
    const orderA = Number(marketsTs.match(new RegExp(`slug:\\s*"${a}"[\\s\\S]*?sortOrder:\\s*(\\d+)`))?.[1] ?? 0);
    const orderB = Number(marketsTs.match(new RegExp(`slug:\\s*"${b}"[\\s\\S]*?sortOrder:\\s*(\\d+)`))?.[1] ?? 0);
    return orderA - orderB;
  });
}

/** Stagger discovery markets: 3 crons per market, 10 min apart, starting at 08:00 UTC */
function buildScrapeCrons(slugs) {
  const crons = [];
  let baseMinute = 0; // minutes from 06:00 UTC

  for (const slug of slugs) {
    const isSd = slug === "san-diego-ca";
    const offset = isSd ? 0 : 120 + baseMinute; // SD at 06:00; others from 08:00+
    if (!isSd) baseMinute += 10;

    const hour = 6 + Math.floor(offset / 60);
    const minute = offset % 60;

    const mk = (platform, extraMin) => {
      const total = offset + extraMin;
      const h = 6 + Math.floor(total / 60);
      const m = total % 60;
      const schedule = `${m} ${h} * * *`;
      const marketParam = isSd ? "" : `&market=${slug}`;
      return {
        path: `/api/scrape?platform=${platform}${marketParam}`,
        schedule,
      };
    };

    crons.push(mk("rvshare", 0));
    crons.push(mk("outdoorsy-1", 2));
    crons.push(mk("outdoorsy-2", 4));
  }

  return crons;
}

function main() {
  const slugs = parseDiscoverySlugs();
  const scrapeCrons = buildScrapeCrons(slugs);

  const lastScrape = scrapeCrons[scrapeCrons.length - 1];
  const lastParts = lastScrape.schedule.split(" ");
  const sweeperMinute = (Number(lastParts[0]) + 15) % 60;
  const sweeperHour = Number(lastParts[1]) + Math.floor((Number(lastParts[0]) + 15) / 60);

  const crons = [
    ...scrapeCrons,
    { path: "/api/sweeper", schedule: `${sweeperMinute} ${sweeperHour} * * *` },
    { path: "/api/detect-duplicates?all=true", schedule: "0 11 * * 0" },
  ];

  const vercel = {
    functions: {
      "app/api/scrape/route.ts": { maxDuration: 300 },
    },
    crons,
  };

  const outPath = path.join(ROOT, "vercel.json");
  fs.writeFileSync(outPath, JSON.stringify(vercel, null, 2) + "\n");

  console.log(`Wrote ${outPath}`);
  console.log(`  Discovery markets: ${slugs.length}`);
  console.log(`  Total crons: ${crons.length}`);
}

main();
