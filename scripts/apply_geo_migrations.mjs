#!/usr/bin/env node
// Apply migrations 012 + 013 to remote Supabase.
//
// Requires DATABASE_URL (Supabase → Settings → Database → Connection string URI)
// or run via CLI:
//   supabase db push --linked -p '<db-password>'
//
// Usage:
//   DATABASE_URL='postgresql://...' node scripts/apply_geo_migrations.mjs

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");

for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();
  }
}

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("Missing DATABASE_URL or SUPABASE_DB_URL in environment.");
  console.error("");
  console.error("Add your Supabase Postgres URI to .env.local, then re-run:");
  console.error("  node scripts/apply_geo_migrations.mjs");
  console.error("");
  console.error("Or push via Supabase CLI:");
  console.error("  supabase link --project-ref ssclxkkfwkmmeivgodvf");
  console.error("  supabase db push --linked --include-all");
  process.exit(1);
}

const result = spawnSync(
  "supabase",
  ["db", "push", "--db-url", dbUrl, "--include-all", "--yes"],
  { cwd: ROOT, stdio: "inherit", encoding: "utf-8" },
);

process.exit(result.status ?? 1);
