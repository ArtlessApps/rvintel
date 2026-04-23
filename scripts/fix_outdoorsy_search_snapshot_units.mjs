#!/usr/bin/env node
// One-shot fixup for Outdoorsy search_snapshots rows written before the
// 2026-04-23 cents→dollars normalization landed in lib/outdoorsy-api.ts and
// scripts/backfill_outdoorsy_sd.mjs. Divides price_{min,max,average,median}
// by 100 for rows where price_median > 1000 (heuristic: $1000+/night medians
// don't exist in SD — any value that large was definitely stored as cents).
//
// raw_meta is left untouched so the originals are preserved. Idempotent —
// a second run finds no rows to fix because price_median is now <1000.

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

const { data: rows, error } = await supabase
  .from("search_snapshots")
  .select("id, platform, rv_class, captured_at, price_min, price_max, price_average, price_median")
  .eq("platform", "outdoorsy")
  .gt("price_median", 1000);

if (error) { console.error(error); process.exit(1); }

console.log(`Found ${rows.length} outdoorsy rows with cent-valued price columns`);

let updated = 0;
for (const r of rows) {
  const patch = {
    price_min: r.price_min !== null ? r.price_min / 100 : null,
    price_max: r.price_max !== null ? r.price_max / 100 : null,
    price_average: r.price_average !== null ? r.price_average / 100 : null,
    price_median: r.price_median !== null ? r.price_median / 100 : null,
  };
  const { error: upErr } = await supabase.from("search_snapshots").update(patch).eq("id", r.id);
  if (upErr) { console.error(`row ${r.id}: ${upErr.message}`); continue; }
  console.log(`  id=${r.id}  ${r.rv_class.padEnd(16)} ${r.captured_at}  median ${r.price_median} -> ${patch.price_median}`);
  updated++;
}
console.log(`Updated ${updated}/${rows.length} rows`);
