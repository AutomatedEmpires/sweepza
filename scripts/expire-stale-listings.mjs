#!/usr/bin/env node
// Inventory freshness operation: transitions active listings whose end_date
// has passed to lifecycle_status 'expired' so they stop counting as live
// inventory and free host slots. Safe to run repeatedly (idempotent); wire it
// to a scheduler for production. The admin command center surfaces the
// current stale count under "Needs attention".
//
// Usage (repo root): node scripts/expire-stale-listings.mjs [--dry-run]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv(path = ".env.local") {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
if (!url || !key) {
  console.error("Missing Supabase URL or service role key in .env.local");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const supabase = createClient(url, key);
const today = new Date().toISOString().slice(0, 10);

const { data: stale, error: findError } = await supabase
  .from("listing")
  .select("id, slug, end_date")
  .eq("lifecycle_status", "active")
  .lt("end_date", today);

if (findError) {
  console.error(`lookup failed: ${findError.message}`);
  process.exit(1);
}

if (!stale || stale.length === 0) {
  console.log("No stale active listings — inventory is fresh.");
  process.exit(0);
}

for (const row of stale) {
  if (dryRun) {
    console.log(`[dry-run] would expire ${row.slug} (ended ${row.end_date})`);
    continue;
  }
  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "expired" })
    .eq("id", row.id);
  if (error) console.error(`✗ ${row.slug}: ${error.message}`);
  else console.log(`✓ expired ${row.slug} (ended ${row.end_date})`);
}

console.log(`\nDone: ${stale.length} stale listing(s) processed${dryRun ? " (dry run)" : ""}.`);
