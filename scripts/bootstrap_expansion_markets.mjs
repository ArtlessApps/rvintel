#!/usr/bin/env node
// Bootstrap discovery data for expansion markets (Outdoorsy + RVshare backfills).
//
// Usage:
//   node scripts/bootstrap_expansion_markets.mjs
//   node scripts/bootstrap_expansion_markets.mjs denver-co phoenix-az
//   node scripts/bootstrap_expansion_markets.mjs --skip los-angeles-ca

import { spawnSync } from "node:child_process";
import path from "node:path";
import { discoverySlugs, EXPANSION_SLUGS } from "./lib/markets-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const skip = new Set();
const args = process.argv.slice(2);
const slugs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--skip") {
    while (args[i + 1] && !args[i + 1].startsWith("--")) skip.add(args[++i]);
  } else if (!args[i].startsWith("--")) {
    slugs.push(args[i]);
  }
}

const targets = (slugs.length ? slugs : discoverySlugs()).filter((s) => !skip.has(s));

if (!targets.length) {
  console.error("No markets to bootstrap.");
  process.exit(1);
}

console.log(`Bootstrapping ${targets.length} discovery market(s):\n  ${targets.join("\n  ")}\n`);

let failures = 0;
for (const slug of targets) {
  console.log(`\n${"=".repeat(64)}\n${slug}\n${"=".repeat(64)}`);
  for (const [script, label] of [
    ["scripts/backfill_rvshare_market.mjs", "RVshare"],
    ["scripts/backfill_outdoorsy_market.mjs", "Outdoorsy"],
  ]) {
    console.log(`\n── ${label} ──`);
    const res = spawnSync("node", [path.join(ROOT, script), slug], {
      cwd: ROOT,
      stdio: "inherit",
      encoding: "utf-8",
    });
    if (res.status !== 0) {
      console.error(`${label} backfill failed for ${slug} (exit ${res.status})`);
      failures++;
    }
  }
}

console.log(`\nDone. ${failures} platform failure(s) across ${targets.length} market(s).`);
process.exit(failures > 0 ? 1 : 0);
