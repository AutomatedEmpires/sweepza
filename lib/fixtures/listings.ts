import type { Listing } from "@/lib/types/listing";

// Deterministic visual-review fixtures. NOT production data — rendered only by
// the /visual-review route, which is gated off real production. Covers the
// full state/imagery/length matrix so the design system can be judged honestly.

const DAY = 24 * 60 * 60 * 1000;
const img = (seed: string) => `https://picsum.photos/seed/${seed}/1200/800`;

interface Spec {
  slug: string;
  title: string;
  shortDescription: string;
  prizeName: string;
  prizeValue?: number;
  category?: Listing["prizeCategory"];
  freq?: Listing["entryFrequency"];
  endInDays: number;
  startAgoDays?: number;
  publishedAgoDays?: number;
  image?: string | null;
  hosted?: string; // host display name
  verified?: boolean;
  featured?: boolean;
  rules?: boolean;
  note?: string; // demo state note (won/entered/etc.)
}

const SPECS: Spec[] = [
  {
    slug: "adventure-truck-giveaway",
    title: "Adventure Truck Giveaway",
    shortDescription: "A trail-ready pickup plus a full overland gear loadout.",
    prizeName: "Pickup truck + gear",
    prizeValue: 62000,
    category: "Vehicles",
    freq: "one_time",
    endInDays: 0,
    startAgoDays: 40,
    publishedAgoDays: 3,
    image: img("truck"),
    hosted: "Bright Horizon Brands",
    verified: true,
    featured: true,
    rules: true,
  },
  {
    slug: "island-escape-week",
    title: "Island Escape: 7-Night Getaway for Two",
    shortDescription: "Flights, an oceanfront resort, and daily excursions in Maui.",
    prizeName: "7-night Maui trip for two",
    prizeValue: 8500,
    category: "Travel",
    freq: "weekly",
    endInDays: 5,
    startAgoDays: 20,
    publishedAgoDays: 2,
    image: img("maui"),
    hosted: "Wanderline Travel",
    verified: true,
    rules: true,
  },
  {
    slug: "daily-cash-drop-500",
    title: "Daily $500 Cash Drop",
    shortDescription: "Come back every day for another shot at five hundred dollars.",
    prizeName: "$500 cash, drawn daily",
    prizeValue: 500,
    category: "Cash",
    freq: "daily",
    endInDays: 12,
    startAgoDays: 10,
    publishedAgoDays: 1,
    image: img("cash"),
    hosted: "FreshMart Stores",
    verified: true,
    rules: true,
    note: "again", // ready again
  },
  {
    slug: "creator-laptop-bundle",
    title: "Creator Laptop Bundle",
    shortDescription: "A creator-grade laptop, dock, and studio headphones.",
    prizeName: "Laptop + accessories",
    prizeValue: 2400,
    category: "Electronics",
    freq: "one_time",
    endInDays: 1,
    startAgoDays: 25,
    publishedAgoDays: 6,
    image: img("laptop"),
    hosted: "Northwind Tech",
    rules: true,
  },
  {
    slug: "snack-stash-instant-win",
    title: "Snack Stash Instant Win",
    shortDescription: "Play daily to instantly win one of a hundred curated boxes.",
    prizeName: "Snack boxes (100 winners)",
    prizeValue: 45,
    category: "Food/Beverage",
    freq: "instant_win",
    endInDays: 20,
    startAgoDays: 5,
    publishedAgoDays: 5,
    image: img("snacks"),
    hosted: "Bright Horizon Brands",
    verified: true,
    rules: true,
    note: "entered",
  },
  {
    slug: "dream-kitchen-refresh",
    title: "Dream Kitchen Refresh",
    shortDescription: "A full counter-to-cabinet appliance package from a national retailer.",
    prizeName: "Kitchen appliance package",
    prizeValue: 5200,
    category: "Home Goods",
    freq: "monthly",
    endInDays: 30,
    startAgoDays: 15,
    publishedAgoDays: 15,
    image: img("kitchen"),
    hosted: "HearthHome Retail",
    rules: true,
  },
  {
    slug: "payday-boost-2500",
    title: "$2,500 Payday Boost",
    shortDescription: "One winner gets a serious payday boost, paid straight out.",
    prizeName: "$2,500 cash",
    prizeValue: 2500,
    category: "Cash",
    freq: "weekly",
    endInDays: 2,
    startAgoDays: 4,
    publishedAgoDays: 4,
    image: img("payday"),
    hosted: "FreshMart Stores",
    verified: true,
    rules: true,
  },
  {
    // No image — verifies the fallback treatment.
    slug: "style-capsule-wardrobe",
    title: "Style Capsule Wardrobe",
    shortDescription: "A personal-stylist session plus a curated capsule credit.",
    prizeName: "$1,200 wardrobe credit",
    prizeValue: 1200,
    category: "Beauty/Fashion",
    freq: "one_time",
    endInDays: 9,
    startAgoDays: 8,
    publishedAgoDays: 8,
    image: null,
    hosted: "Atelier Loft",
    rules: false,
  },
  {
    // Very long title + no prize value — stress the layout.
    slug: "national-parks-roadtrip",
    title:
      "The Great American National Parks Road Trip Sweepstakes — RV, Fuel, and a Season Pass",
    shortDescription: "Two weeks, five parks, one RV — fuel and passes covered.",
    prizeName: "RV rental + parks pass + fuel",
    category: "Travel",
    freq: "one_time",
    endInDays: 25,
    startAgoDays: 2,
    publishedAgoDays: 2,
    image: img("rv"),
    hosted: "Wanderline Travel",
    rules: true,
  },
  {
    slug: "holiday-lights-bundle",
    title: "Holiday Lights Mega Bundle",
    shortDescription: "A whole-house smart lighting kit before the season starts.",
    prizeName: "Smart holiday lighting kit",
    prizeValue: 650,
    category: "Seasonal/Holiday",
    freq: "one_time",
    endInDays: 3,
    startAgoDays: 10,
    publishedAgoDays: 3,
    image: img("lights"),
    hosted: "GlowSeason Co.",
    rules: true,
  },
  {
    // Won — permanent achievement.
    slug: "dream-cash-10k",
    title: "Win $10,000 Dream Cash",
    shortDescription: "Ten grand, no strings — a founding-era headline prize.",
    prizeName: "$10,000 cash",
    prizeValue: 10000,
    category: "Cash",
    freq: "one_time",
    endInDays: -6,
    startAgoDays: 40,
    publishedAgoDays: 30,
    image: img("dreamcash"),
    hosted: "Sweepza",
    rules: true,
    note: "won",
  },
  {
    slug: "trailhead-gear-refit",
    title: "Trailhead Gear Refit",
    shortDescription: "Tent, pack, stove, and boots — a season of trails, outfitted.",
    prizeName: "Camping + hiking gear set",
    prizeValue: 1800,
    category: "Outdoor Gear",
    freq: "weekly",
    endInDays: 15,
    startAgoDays: 12,
    publishedAgoDays: 4,
    image: img("gear"),
    hosted: "TrailPeak Outfitters",
    rules: true,
    note: "saved",
  },
];

export function buildFixtureListings(now: Date = new Date()): Listing[] {
  return SPECS.map((s, i) => {
    const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();
    return {
      id: `fixture-${i}-${s.slug}`,
      slug: s.slug,
      title: s.title,
      shortDescription: s.shortDescription,
      longDescription: `${s.shortDescription}\n\nThis is the full record for the prize — what's included, how the drawing works, and what to expect if you win. One winner will be selected at random after the sweepstakes closes and notified by the host. No purchase is necessary to enter or win, and entering never costs anything on Sweepza.`,
      prizeName: s.prizeName,
      prizeValue: s.prizeValue,
      prizeCurrency: "USD",
      prizeCategory: s.category,
      mainImageUrl: s.image ?? undefined,
      imageAltText: s.prizeName,
      entryUrl: `https://entries.example.com/${s.slug}`,
      officialRulesUrl: s.rules ? `https://entries.example.com/${s.slug}/rules` : undefined,
      startDate: iso(-(s.startAgoDays ?? 10) * DAY),
      endDate: iso(s.endInDays * DAY),
      entryFrequency: s.freq ?? "one_time",
      eligibilityCountry: "US",
      ageRequirement: 18,
      sourceLabel: s.hosted && s.hosted !== "Sweepza" ? "host_submitted" : "found_by_sweepza",
      originalSponsorName: s.hosted && s.hosted !== "Sweepza" ? undefined : undefined,
      host:
        s.hosted && s.hosted !== "Sweepza"
          ? {
              id: `host-${i}`,
              name: s.hosted,
              verificationStatus: s.verified ? "admin_verified" : "none",
            }
          : undefined,
      lifecycleStatus: s.endInDays < 0 ? "expired" : "active",
      listingVerificationStatus: s.verified ? "verified" : "unreviewed",
      isFeatured: s.featured,
      publishedAt: iso(-(s.publishedAgoDays ?? 5) * DAY),
      winnerReported: s.note === "won",
    } satisfies Listing;
  });
}

/** Demo seeker state so the review page can show personal-state contexts. */
export function fixtureSeekerNotes(): Record<
  string,
  "won" | "entered" | "saved" | "again"
> {
  const map: Record<string, "won" | "entered" | "saved" | "again"> = {};
  SPECS.forEach((s, i) => {
    if (s.note) map[`fixture-${i}-${s.slug}`] = s.note as never;
  });
  return map;
}
