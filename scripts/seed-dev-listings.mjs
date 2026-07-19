#!/usr/bin/env node
// Seeds representative sweepstakes inventory for development / staging QA.
// Idempotent: upserts by slug, re-run any time to refresh end dates so the
// catalog never goes stale while testing. Marks every row with
// sponsor_notes_internal = 'dev-seed' so it is easy to purge before launch:
//   delete from listing where sponsor_notes_internal = 'dev-seed';
//
// Usage (repo root): node scripts/seed-dev-listings.mjs

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

const supabase = createClient(url, key);

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const iso = (date) => date.toISOString();
const dateOnly = (date) => date.toISOString().slice(0, 10);
const inDays = (days) => new Date(now.getTime() + days * DAY);
const agoDays = (days) => new Date(now.getTime() - days * DAY);

async function ensureDemoHost() {
  const { data: appUser, error: appUserError } = await supabase
    .from("app_user")
    .upsert(
      {
        clerk_user_id: "dev-seed-host",
        email: "host-demo@sweepza.dev",
        display_name: "Bright Horizon Brands",
        is_host: true,
        is_seeker: false,
      },
      { onConflict: "clerk_user_id" },
    )
    .select("id")
    .single();
  if (appUserError) throw new Error(`app_user upsert: ${appUserError.message}`);

  const { data: existing, error: findError } = await supabase
    .from("host")
    .select("id")
    .eq("app_user_id", appUser.id)
    .maybeSingle();
  if (findError) throw new Error(`host lookup: ${findError.message}`);
  if (existing) return existing.id;

  const { data: host, error: hostError } = await supabase
    .from("host")
    .insert({
      app_user_id: appUser.id,
      display_name: "Bright Horizon Brands",
      website_url: "https://brighthorizon.example.com",
      short_description:
        "Consumer brands group running seasonal giveaway campaigns.",
      verification_status: "admin_verified",
    })
    .select("id")
    .single();
  if (hostError) throw new Error(`host insert: ${hostError.message}`);
  return host.id;
}

// The active-listing cap trigger reads subscription.max_active_listings
// (default 1 with no row). Give the demo host a real entitlement so hosted
// seed listings publish through the same path a subscribed host would use.
async function ensureDemoEntitlement(hostId) {
  const { data: existing, error: findError } = await supabase
    .from("subscription")
    .select("id, max_active_listings")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error(`subscription lookup: ${findError.message}`);
  if (existing && existing.max_active_listings >= 7) return;

  const row = {
    host_id: hostId,
    status: "active",
    included_active_listings: 5,
    purchased_additional_listings: 2,
    max_active_listings: 7,
  };
  const { error } = existing
    ? await supabase.from("subscription").update(row).eq("id", existing.id)
    : await supabase.from("subscription").insert(row);
  if (error) throw new Error(`subscription upsert: ${error.message}`);
}

/**
 * end: days from now. start: days ago. hosted: attach the demo host.
 * freq: entry_frequency. cat: category code. value: prize value USD.
 */
const LISTINGS = [
  { slug: "daily-cash-drop-500", title: "Daily $500 Cash Drop", prize: "$500 cash", value: 500, cat: "cash", freq: "daily", end: 12, start: 10, hosted: true, featured: true, verified: "verified", tags: ["high_value", "easy_entry"], desc: "Enter once a day for a shot at $500 cash, drawn every Friday." },
  { slug: "grocery-giftcard-sprint", sponsor: "FreshMart Stores", title: "$250 Grocery Gift Card Sprint", prize: "$250 grocery gift card", value: 250, cat: "gift_cards", freq: "daily", end: 0, start: 20, hosted: false, verified: "reviewed", tags: ["easy_entry", "no_purchase"], desc: "Last day to enter — one lucky shopper covers a month of groceries." },
  { slug: "island-escape-week", title: "Island Escape: 7-Night Getaway", prize: "7-night trip for two to Maui", value: 8500, cat: "travel", freq: "weekly", end: 5, start: 30, hosted: true, verified: "verified", tags: ["high_value"], desc: "Flights, resort, and excursions included. Weekly entries allowed." },
  { slug: "creator-laptop-bundle", sponsor: "Northwind Tech", title: "Creator Laptop Bundle", prize: "Laptop + accessories bundle", value: 2400, cat: "electronics", freq: "one_time", end: 2, start: 25, hosted: false, verified: "reviewed", tags: ["high_value"], desc: "A creator-grade laptop, dock, and headphones. Ends this week." },
  { slug: "snack-stash-instant-win", title: "Snack Stash Instant Win", prize: "Snack boxes (100 winners)", value: 45, cat: "food_beverage", freq: "instant_win", end: 20, start: 5, hosted: true, verified: "verified", tags: ["easy_entry"], desc: "Play daily — instant win a curated snack box. 100 boxes up for grabs." },
  { slug: "dream-kitchen-refresh", sponsor: "HearthHome Retail", title: "Dream Kitchen Refresh", prize: "Kitchen appliance package", value: 5200, cat: "home", freq: "monthly", end: 30, start: 15, hosted: false, verified: "unreviewed", tags: ["high_value"], desc: "A full counter-to-cabinet appliance refresh from a national retailer." },
  { slug: "weekend-truck-giveaway", title: "Adventure Truck Giveaway", prize: "Pickup truck + gear package", value: 62000, cat: "vehicles", freq: "one_time", end: 1, start: 60, hosted: true, featured: true, verified: "verified", tags: ["high_value"], desc: "The flagship giveaway: a trail-ready truck and a full gear loadout. Ends tomorrow." },
  { slug: "trailhead-gear-refit", sponsor: "TrailPeak Outfitters", title: "Trailhead Gear Refit", prize: "Camping + hiking gear set", value: 1800, cat: "outdoor", freq: "weekly", end: 9, start: 12, hosted: false, verified: "reviewed", tags: ["easy_entry"], desc: "Tent, pack, stove, and boots — everything for a season outside." },
  { slug: "style-capsule-wardrobe", sponsor: "Atelier Loft", title: "Style Capsule Wardrobe", prize: "$1,200 wardrobe styling credit", value: 1200, cat: "fashion_beauty", freq: "one_time", end: 15, start: 8, hosted: false, verified: "unreviewed", tags: [], desc: "A personal-stylist session plus a capsule wardrobe credit." },
  { slug: "family-park-passes", title: "Family Theme Park Passes", prize: "4 annual theme park passes", value: 2800, cat: "family_kids", freq: "daily", end: 7, start: 14, hosted: true, verified: "verified", tags: ["family_friendly", "no_purchase"], desc: "Enter daily to win a year of family park days — four annual passes." },
  { slug: "holiday-lights-bundle", sponsor: "GlowSeason Co.", title: "Holiday Lights Mega Bundle", prize: "Smart holiday lighting kit", value: 650, cat: "seasonal", freq: "one_time", end: 3, start: 10, hosted: false, verified: "reviewed", tags: ["easy_entry"], desc: "A whole-house smart lighting kit before the season starts." },
  { slug: "payday-boost-2500", title: "$2,500 Payday Boost", prize: "$2,500 cash", value: 2500, cat: "cash", freq: "weekly", end: 18, start: 4, hosted: true, verified: "verified", tags: ["high_value", "no_purchase"], desc: "One winner gets a serious payday boost. Weekly re-entry keeps you in." },
  { slug: "national-parks-roadtrip", sponsor: "Wanderline Travel", title: "National Parks Road Trip", prize: "RV rental + parks pass + fuel card", value: 6800, cat: "travel", freq: "one_time", end: 25, start: 2, hosted: false, verified: "unreviewed", tags: ["high_value"], desc: "Two weeks, five parks, one RV — with fuel and passes covered." },
  { slug: "game-night-instant-win", title: "Game Night Instant Win", prize: "Console + game bundles (25 winners)", value: 720, cat: "electronics", freq: "instant_win", end: 6, start: 9, hosted: true, verified: "reviewed", tags: ["family_friendly"], desc: "Instant-win a console bundle — 25 winners while the pool lasts." },
];

async function main() {
  const hostId = await ensureDemoHost();
  await ensureDemoEntitlement(hostId);
  console.log(`Demo host ready: ${hostId}`);

  let upserted = 0;
  for (const item of LISTINGS) {
    const hosted = item.hosted;
    const row = {
      slug: item.slug,
      title: item.title,
      short_description: item.desc,
      long_description: `${item.desc}\n\nNo purchase necessary. See official rules for eligibility and entry details.`,
      prize_name: item.prize,
      prize_value: item.value,
      prize_currency: "USD",
      prize_category: item.cat,
      winner_count: item.freq === "instant_win" ? 25 : 1,
      main_image_url: `https://picsum.photos/seed/sweepza-${item.slug}/800/600`,
      image_source_type: "external_reference",
      image_alt_text: item.prize,
      entry_url: `https://entries.example.com/${item.slug}`,
      official_rules_url: `https://entries.example.com/${item.slug}/rules`,
      start_date: dateOnly(agoDays(item.start)),
      end_date: dateOnly(inDays(item.end)),
      entry_frequency: item.freq,
      eligibility_country: "US",
      age_requirement: 18,
      no_purchase_necessary: true,
      source_type: hosted ? "host_submitted" : "owner_seeded",
      public_source_label: hosted ? "host_submitted" : "found_by_sweepza",
      created_by_role: hosted ? "host" : "owner",
      host_id: hosted ? hostId : null,
      sponsor_name: hosted ? null : item.sponsor ?? null,
      sponsor_notes_internal: "dev-seed",
      lifecycle_status: "active",
      visibility_status: "public",
      moderation_status: "clear",
      duplicate_status: "clear",
      listing_verification_status: item.verified,
      is_featured: Boolean(item.featured),
      published_at: iso(agoDays(Math.min(item.start, 6))),
    };

    // Select-then-write instead of upsert: the active-listing-cap BEFORE
    // INSERT trigger fires before ON CONFLICT resolution, so a re-run upsert
    // of an existing hosted row would count itself against the cap and fail.
    const { data: existingRow, error: lookupError } = await supabase
      .from("listing")
      .select("id")
      .eq("slug", item.slug)
      .maybeSingle();
    if (lookupError) {
      console.error(`✗ ${item.slug}: ${lookupError.message}`);
      continue;
    }

    const { data, error } = existingRow
      ? await supabase
          .from("listing")
          .update(row)
          .eq("id", existingRow.id)
          .select("id")
          .single()
      : await supabase.from("listing").insert(row).select("id").single();
    if (error) {
      console.error(`✗ ${item.slug}: ${error.message}`);
      continue;
    }

    if (item.tags.length > 0) {
      const { error: tagError } = await supabase.from("listing_tag").upsert(
        item.tags.map((tag_code) => ({ listing_id: data.id, tag_code })),
        { onConflict: "listing_id,tag_code" },
      );
      if (tagError) console.error(`  tag attach ${item.slug}: ${tagError.message}`);
    }

    upserted += 1;
    console.log(`✓ ${item.slug} (ends ${row.end_date})`);
  }

  console.log(`\nDone: ${upserted}/${LISTINGS.length} listings upserted.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
