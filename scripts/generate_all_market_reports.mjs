#!/usr/bin/env node
// Generate HTML market reports for all markets with active geo listings.
//
// Usage:
//   node scripts/generate_all_market_reports.mjs
//   node scripts/generate_all_market_reports.mjs los-angeles-ca denver-co

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { EXPANSION_SLUGS } from "./lib/markets-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function hasListings(slug) {
  const { data, error } = await supabase
    .rpc("listings_in_market", { p_market_slug: slug, p_active_only: true })
    .select("id")
    .limit(1);
  return !error && data && data.length > 0;
}

async function main() {
  const argSlugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const slugs = argSlugs.length ? argSlugs : [...EXPANSION_SLUGS, "san-diego-ca", "riverside-county-ca", "portland-or", "arklatex"];

  const outDir = path.join(ROOT, "public", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let generated = 0;
  for (const slug of slugs) {
    if (!(await hasListings(slug))) {
      console.log(`skip ${slug} — no listings`);
      continue;
    }
    console.log(`\nGenerating ${slug}...`);
    const res = spawnSync("node", ["scripts/generate_market_report.mjs", "--market", slug], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      console.error(`failed ${slug}`);
      continue;
    }
    const year = new Date().getFullYear();
    const qNum = Math.floor(new Date().getMonth() / 3) + 1;
    const q = `q${qNum}`;
    const src = path.join(ROOT, "MarketReports", `${slug}-rv-market-report-${q}-${year}.html`);
    const dest = path.join(outDir, `${slug}-rv-market-report-${q}-${year}.html`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  → public/reports/${path.basename(dest)}`);
      generated++;
    }
  }
  console.log(`\nDone. ${generated} report(s) copied to public/reports/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
