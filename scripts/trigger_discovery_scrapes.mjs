#!/usr/bin/env node
// Trigger production discovery scrapes for one or more markets.
//
// Usage:
//   node scripts/trigger_discovery_scrapes.mjs los-angeles-ca sacramento-ca
//   node scripts/trigger_discovery_scrapes.mjs --batch ca-mountain-west
//   node scripts/trigger_discovery_scrapes.mjs --all-new

import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();
  }
}

const BASE_URL = (process.env.PRODUCTION_URL || "https://rvintel.io").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error("Missing CRON_SECRET in .env.local");
  process.exit(1);
}

const BATCHES = {
  "ca-mountain-west": [
    "los-angeles-ca",
    "orange-county-ca",
    "sacramento-ca",
    "san-francisco-ca",
    "denver-co",
    "salt-lake-city-ut",
    "reno-nv",
    "cheyenne-wy",
  ],
  southwest: [
    "phoenix-az",
    "austin-tx",
    "san-antonio-tx",
    "dallas-fort-worth-tx",
    "albuquerque-nm",
  ],
  southeast: ["orlando-fl", "tampa-fl", "atlanta-ga", "chattanooga-tn", "jacksonville-fl"],
  midwest: [
    "columbus-oh",
    "cincinnati-oh",
    "detroit-mi",
    "grand-rapids-mi",
    "madison-wi",
    "milwaukee-wi",
    "minneapolis-mn",
  ],
  northeast: [
    "philadelphia-pa",
    "baltimore-md",
    "new-york-ny",
    "washington-dc",
    "harrisburg-pa",
    "hartford-ct",
  ],
  pacific: ["seattle-wa"],
};

const EXISTING = new Set([
  "san-diego-ca",
  "riverside-county-ca",
  "portland-or",
  "arklatex",
]);

const PLATFORMS = ["rvshare", "outdoorsy"];

function parseArgs(argv) {
  if (argv.includes("--all-new")) {
    return Object.values(BATCHES).flat();
  }

  const batchNames = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--batch=")) {
      batchNames.push(argv[i].split("=")[1]);
    } else if (argv[i] === "--batch" && argv[i + 1]) {
      batchNames.push(argv[i + 1]);
      i++;
    }
  }

  if (batchNames.length) {
    const slugs = [];
    for (const name of batchNames) {
      const list = BATCHES[name];
      if (!list) {
        console.error(`Unknown batch "${name}". Options: ${Object.keys(BATCHES).join(", ")}`);
        process.exit(1);
      }
      slugs.push(...list);
    }
    return [...new Set(slugs)];
  }

  return argv.filter((a) => !a.startsWith("--"));
}

async function trigger(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { "x-vercel-cron": CRON_SECRET },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { url, status: res.status, body };
}

async function main() {
  const slugs = parseArgs(process.argv.slice(2));
  if (!slugs.length) {
    console.error("Usage: node scripts/trigger_discovery_scrapes.mjs [--batch <name>|--all-new|<slug> ...]");
    process.exit(1);
  }

  console.log(`Triggering discovery scrapes on ${BASE_URL} for ${slugs.length} market(s)\n`);

  for (const slug of slugs) {
    const tag = EXISTING.has(slug) ? "(existing)" : "(new)";
    console.log(`\n=== ${slug} ${tag} ===`);
    for (const platform of PLATFORMS) {
      const marketParam = slug === "san-diego-ca" ? "" : `&market=${slug}`;
      const path = `/api/scrape?platform=${platform}${marketParam}`;
      process.stdout.write(`  ${platform}...`);
      const result = await trigger(path);
      const ok = result.status >= 200 && result.status < 300;
      const summary = result.body?.success ?? result.body?.error ?? result.status;
      console.log(ok ? ` OK` : ` FAIL (${result.status})`, typeof summary === "object" ? "" : `- ${summary}`);
      if (!ok) console.log("   ", JSON.stringify(result.body).slice(0, 300));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
