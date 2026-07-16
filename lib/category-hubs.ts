import {
  CATEGORY_CODE_TO_PRIZE_CATEGORY,
  PRIZE_CATEGORY_TO_CATEGORY_CODE,
} from "@/lib/db/adapters";
import type { PrizeCategory } from "@/lib/types/listing";

/**
 * Category hub pages — the programmatic-SEO landing surface.
 *
 * Each hub is a crawlable URL (/discover/{slug}) over one dictionary category,
 * with its own title, description, and editorial intro. Hubs are built strictly
 * over the controlled taxonomy (CATEGORY_CODE_TO_PRIZE_CATEGORY): every
 * dictionary category has exactly one hub and every hub maps to exactly one
 * dictionary code — a test enforces the bijection so taxonomy changes cannot
 * silently orphan a landing page.
 *
 * Copy rules (canon): describe what seekers actually find; never promise wins,
 * never imply paid entry improves anything, never invent inventory counts.
 */
export interface CategoryHub {
  /** URL segment under /discover — hyphenated, human-readable. */
  slug: string;
  /** Dictionary code (listing.prize_category). */
  code: string;
  /** Display label (canonical PrizeCategory). */
  label: PrizeCategory;
  /** <title> — keyword-forward, honest. */
  title: string;
  /** Meta description + hub intro. */
  description: string;
}

export const CATEGORY_HUBS: CategoryHub[] = [
  {
    slug: "cash",
    code: "cash",
    label: "Cash",
    title: "Cash Sweepstakes — Free to Enter",
    description:
      "Open cash giveaways with no purchase necessary — from daily-entry cash drops to large one-time prizes, each linked to the sponsor's official rules.",
  },
  {
    slug: "gift-cards",
    code: "gift_cards",
    label: "Gift Cards",
    title: "Gift Card Sweepstakes & Giveaways",
    description:
      "Win gift cards to major retailers and brands. Every listing is free to enter and links straight to the sponsor's official entry page.",
  },
  {
    slug: "travel",
    code: "travel",
    label: "Travel",
    title: "Travel Sweepstakes — Win Trips & Getaways",
    description:
      "Trips, flights, hotel stays, and vacation packages from verified sources — always no purchase necessary, always with the official rules attached.",
  },
  {
    slug: "vehicles",
    code: "vehicles",
    label: "Vehicles",
    title: "Car & Vehicle Sweepstakes",
    description:
      "Cars, trucks, motorcycles, and powersports giveaways, free to enter with the sponsor's official rules linked on every listing.",
  },
  {
    slug: "electronics",
    code: "electronics",
    label: "Electronics",
    title: "Electronics Sweepstakes — Phones, TVs & More",
    description:
      "Phones, laptops, TVs, consoles, and gadget giveaways gathered from official sources. Free entry, official rules on every listing.",
  },
  {
    slug: "outdoor",
    code: "outdoor",
    label: "Outdoor Gear",
    title: "Outdoor Gear Sweepstakes",
    description:
      "Camping, fishing, hunting, and adventure-gear giveaways — free to enter, sourced from the sponsors running them.",
  },
  {
    slug: "home",
    code: "home",
    label: "Home Goods",
    title: "Home Goods Sweepstakes & Giveaways",
    description:
      "Furniture, appliances, kitchen upgrades, and home-makeover giveaways, each linked to the official entry page and rules.",
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
      "Wardrobe, cosmetics, and style giveaways from brands and creators, with official rules linked on every listing.",
  },
  {
    slug: "family-kids",
    code: "family_kids",
    label: "Family/Kids",
    title: "Family & Kids Sweepstakes",
    description:
      "Toys, family experiences, and kid-friendly prize giveaways, gathered from official sources and free to enter.",
  },
  {
    slug: "seasonal",
    code: "seasonal",
    label: "Seasonal/Holiday",
    title: "Seasonal & Holiday Sweepstakes",
    description:
      "Holiday-season giveaways and limited-window seasonal prizes — free entry, official rules on every listing.",
  },
];

const BY_SLUG = new Map(CATEGORY_HUBS.map((hub) => [hub.slug, hub]));

export function getCategoryHub(slug: string): CategoryHub | undefined {
  return BY_SLUG.get(slug);
}

// Re-exported so the bijection test can assert full dictionary coverage
// without reaching into lib/db internals.
export const DICTIONARY_CODES = Object.keys(CATEGORY_CODE_TO_PRIZE_CATEGORY);
export const DICTIONARY_LABELS = Object.keys(
  PRIZE_CATEGORY_TO_CATEGORY_CODE,
) as PrizeCategory[];
