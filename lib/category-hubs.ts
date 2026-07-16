import { CATEGORY_CODE_TO_PRIZE_CATEGORY } from "@/lib/db/adapters";

/**
 * Category hub pages — the programmatic-SEO landing surface.
 *
 * Each hub is a crawlable URL (/discover/{slug}) over one dictionary category,
 * with its own title, description, and editorial intro. Coverage is measured
 * against the CANONICAL category dictionary (the `category` seed in
 * supabase/migrations/20260604120700_seed_dictionaries.sql), not the narrower
 * UI PrizeCategory projection: every canonical code either has exactly one hub
 * or appears in EXCLUDED_CATEGORY_CODES with a stated reason. A test enforces
 * that partition so taxonomy changes cannot silently orphan a landing page.
 *
 * Copy rules (canon): describe what seekers actually find; never promise wins,
 * never imply paid entry improves anything, never invent inventory counts, and
 * never make per-listing claims the data model does not universally enforce
 * (listings can publish while unreviewed, and rare admin-approved
 * official-rules exceptions exist — so hub copy must not say "verified" or
 * "official rules on every listing"). "Free to enter / no purchase necessary"
 * is platform policy and is safe to state.
 */
export interface CategoryHub {
  /** URL segment under /discover — hyphenated, human-readable. */
  slug: string;
  /** Canonical dictionary code (listing.prize_category). */
  code: string;
  /** Display label for the H1 and links. */
  label: string;
  /** <title> — keyword-forward, honest. */
  title: string;
  /** Meta description + hub intro. */
  description: string;
}

/**
 * Canonical category codes, mirrored from the seed dictionary. The bijection
 * test asserts CATEGORY_HUBS ∪ EXCLUDED_CATEGORY_CODES === this list, so a
 * seed change forces a conscious decision here.
 */
export const CANONICAL_CATEGORY_CODES = [
  "cash",
  "gift_cards",
  "travel",
  "vehicles",
  "electronics",
  "outdoor",
  "home",
  "food_beverage",
  "fashion_beauty",
  "family_kids",
  "experiences",
  "seasonal",
  "other",
] as const;

/**
 * Deliberately hub-less canonical codes.
 * - `other`: the catch-all bucket. "Other sweepstakes" has no search intent
 *   and no honest editorial framing; those listings remain reachable through
 *   Discover and search.
 */
export const EXCLUDED_CATEGORY_CODES = ["other"] as const;

export const CATEGORY_HUBS: CategoryHub[] = [
  {
    slug: "cash",
    code: "cash",
    label: "Cash",
    title: "Cash Sweepstakes — Free to Enter",
    description:
      "Open cash giveaways with no purchase necessary — from daily-entry cash drops to large one-time prizes, each linked to the sponsor's entry page.",
  },
  {
    slug: "gift-cards",
    code: "gift_cards",
    label: "Gift Cards",
    title: "Gift Card Sweepstakes & Giveaways",
    description:
      "Win gift cards to major retailers and brands. Every listing is free to enter and links to the sponsor's entry page.",
  },
  {
    slug: "travel",
    code: "travel",
    label: "Travel",
    title: "Travel Sweepstakes — Win Trips & Getaways",
    description:
      "Trips, flights, hotel stays, and vacation packages — always no purchase necessary, with each listing linked to the sponsor's entry page.",
  },
  {
    slug: "vehicles",
    code: "vehicles",
    label: "Vehicles",
    title: "Car & Vehicle Sweepstakes",
    description:
      "Cars, trucks, motorcycles, and powersports giveaways — free to enter, linked to the sponsor running each one.",
  },
  {
    slug: "electronics",
    code: "electronics",
    label: "Electronics",
    title: "Electronics Sweepstakes — Phones, TVs & More",
    description:
      "Phones, laptops, TVs, consoles, and gadget giveaways. Free entry, with the sponsor's entry page linked on each listing.",
  },
  {
    slug: "outdoor",
    code: "outdoor",
    label: "Outdoor Gear",
    title: "Outdoor Gear Sweepstakes",
    description:
      "Camping, fishing, hunting, and adventure-gear giveaways — free to enter, gathered from the sponsors running them.",
  },
  {
    slug: "home",
    code: "home",
    label: "Home Goods",
    title: "Home Goods Sweepstakes & Giveaways",
    description:
      "Furniture, appliances, kitchen upgrades, and home-makeover giveaways, each linked to the sponsor's entry page.",
  },
  {
    slug: "food-beverage",
    code: "food_beverage",
    label: "Food/Beverage",
    title: "Food & Beverage Sweepstakes",
    description:
      "Grocery hauls, restaurant prizes, and food-brand giveaways — always free to enter, never pay-to-play.",
  },
  {
    slug: "beauty-fashion",
    code: "fashion_beauty",
    label: "Beauty/Fashion",
    title: "Beauty & Fashion Sweepstakes",
    description:
      "Wardrobe, cosmetics, and style giveaways from brands and creators, free to enter with the sponsor's entry page linked.",
  },
  {
    slug: "family-kids",
    code: "family_kids",
    label: "Family/Kids",
    title: "Family & Kids Sweepstakes",
    description:
      "Toys, family experiences, and kid-friendly prize giveaways — free to enter, straight from the sponsors running them.",
  },
  {
    slug: "experiences",
    code: "experiences",
    label: "Experiences",
    title: "Experience Sweepstakes — Tickets, Events & VIP Prizes",
    description:
      "Concert tickets, sports packages, meet-and-greets, and once-in-a-while experiences — free to enter, linked to the sponsor's entry page.",
  },
  {
    slug: "seasonal",
    code: "seasonal",
    label: "Seasonal/Holiday",
    title: "Seasonal & Holiday Sweepstakes",
    description:
      "Holiday-season giveaways and limited-window seasonal prizes — free entry, no purchase necessary.",
  },
];

const BY_SLUG = new Map(CATEGORY_HUBS.map((hub) => [hub.slug, hub]));

export function getCategoryHub(slug: string): CategoryHub | undefined {
  return BY_SLUG.get(slug);
}

// UI projection codes, re-exported for the coverage test: every code the UI
// can render a chip for must also have a hub.
export const PROJECTION_CODES = Object.keys(CATEGORY_CODE_TO_PRIZE_CATEGORY);
