#!/usr/bin/env node
// Lat/lng coverage audit — gate before geo markets go-live (target ≥95%).
//
// Usage: node scripts/audit_lat_coverage.mjs

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

const GATE_PCT = 95;

async function countActive(platform) {
  let q = supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (platform) q = q.eq("platform", platform);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countWithCoords(platform) {
  let q = supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .not("location_lat", "is", null)
    .not("location_lng", "is", null);
  if (platform) q = q.eq("platform", platform);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function report(label, total, withCoords) {
  const pct = total ? (withCoords / total) * 100 : 0;
  const pass = pct >= GATE_PCT;
  console.log(
    `${label.padEnd(22)} ${String(withCoords).padStart(6)} / ${String(total).padStart(6)}  (${pct.toFixed(1)}%)  ${pass ? "PASS" : "FAIL"}`,
  );
  return pass;
}

async function main() {
  console.log(`Geo lat/lng coverage audit (gate: ≥${GATE_PCT}%)\n`);

  const [totalAll, coordsAll, totalOd, coordsOd, totalRv, coordsRv] = await Promise.all([
    countActive(null),
    countWithCoords(null),
    countActive("outdoorsy"),
    countWithCoords("outdoorsy"),
    countActive("rvshare"),
    countWithCoords("rvshare"),
  ]);

  const results = [
    report("All platforms", totalAll, coordsAll),
    report("Outdoorsy", totalOd, coordsOd),
    report("RVshare", totalRv, coordsRv),
  ];

  const overallPct = totalAll ? (coordsAll / totalAll) * 100 : 0;
  console.log();
  if (results.every(Boolean)) {
    console.log(`✓ Gate passed — ${overallPct.toFixed(1)}% of active listings have coordinates.`);
    process.exit(0);
  } else {
    console.log(`✗ Gate failed — ${overallPct.toFixed(1)}% overall (need ≥${GATE_PCT}%).`);
    console.log("  Listings without coords are excluded from geo market queries.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
