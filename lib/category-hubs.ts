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
 * (listings can publish while unreviewed, so hub copy must not say "verified").
 *
 * ⚠️ This rule USED to end: '...rare admin-approved official-rules exceptions
 * exist — so hub copy must not say "official rules on every listing". "Free to
 * enter / no purchase necessary" is platform policy and is safe to state.'
 * That reasoning was exactly inverted, and it is worth keeping the correction
 * visible:
 *
 *   - "official rules on every listing" was BANNED for an exception that was
 *     unreachable (nothing could set official_rules_exception true — both write
 *     schemas require officialRulesUrl). The column is now dropped and the
 *     publish guard hard-requires a rules URL, so this claim is TRUE and may be
 *     stated.
 *   - "free to enter / no purchase necessary" was ALLOWED as "platform policy"
 *     while having STRICTLY WEAKER enforcement than the claim above — namely
 *     none. `no_purchase_necessary` is nullable, unchecked by
 *     listing_publish_guard(), and absent from both write schemas. It is a
 *     third party's legal representation about their own promotion, and it is
 *     the phrase separating a lawful sweepstakes from an illegal lottery.
 *
 * So: NEVER assert no-purchase/free-to-enter on a listing's behalf, and never
 * claim an entry or rules URL is sponsor-OWNED (nothing verifies that). Point
 * at the official rules — they are the authority. Enforced by
 * lib/__tests__/honest-copy.test.ts, which now scans this file.
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
    title: "Cash Sweepstakes & Giveaways",
    description:
      "Open cash giveaways, from daily-entry cash drops to large one-time prizes. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "gift-cards",
    code: "gift_cards",
    label: "Gift Cards",
    title: "Gift Card Sweepstakes & Giveaways",
    description:
      "Gift cards to major retailers and brands. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "travel",
    code: "travel",
    label: "Travel",
    title: "Travel Sweepstakes — Win Trips & Getaways",
    description:
      "Trips, flights, hotel stays, and vacation packages. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "vehicles",
    code: "vehicles",
    label: "Vehicles",
    title: "Car & Vehicle Sweepstakes",
    description:
      "Cars, trucks, motorcycles, and powersports giveaways. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "electronics",
    code: "electronics",
    label: "Electronics",
    title: "Electronics Sweepstakes — Phones, TVs & More",
    description:
      "Phones, laptops, TVs, consoles, and gadget giveaways. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "outdoor",
    code: "outdoor",
    label: "Outdoor Gear",
    title: "Outdoor Gear Sweepstakes",
    description:
      "Camping, fishing, hunting, and adventure-gear giveaways. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "home",
    code: "home",
    label: "Home Goods",
    title: "Home Goods Sweepstakes & Giveaways",
    description:
      "Furniture, appliances, kitchen upgrades, and home-makeover giveaways. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "food-beverage",
    code: "food_beverage",
    label: "Food/Beverage",
    title: "Food & Beverage Sweepstakes",
    description:
      "Grocery hauls, restaurant prizes, and food-brand giveaways. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "beauty-fashion",
    code: "fashion_beauty",
    label: "Beauty/Fashion",
    title: "Beauty & Fashion Sweepstakes",
    description:
      "Wardrobe, cosmetics, and style giveaways from brands and creators. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "family-kids",
    code: "family_kids",
    label: "Family/Kids",
    title: "Family & Kids Sweepstakes",
    description:
      "Toys, family experiences, and kid-friendly prize giveaways. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "experiences",
    code: "experiences",
    label: "Experiences",
    title: "Experience Sweepstakes — Tickets, Events & VIP Prizes",
    description:
      "Concert tickets, sports packages, meet-and-greets, and once-in-a-while experiences. Each listing links to its official entry page and official rules.",
  },
  {
    slug: "seasonal",
    code: "seasonal",
    label: "Seasonal/Holiday",
    title: "Seasonal & Holiday Sweepstakes",
    description:
      "Holiday-season giveaways and limited-window seasonal prizes. Each listing links to its official entry page and official rules.",
  },
];

const BY_SLUG = new Map(CATEGORY_HUBS.map((hub) => [hub.slug, hub]));

export function getCategoryHub(slug: string): CategoryHub | undefined {
  return BY_SLUG.get(slug);
}

// UI projection codes, re-exported for the coverage test: every code the UI
// can render a chip for must also have a hub.
export const PROJECTION_CODES = Object.keys(CATEGORY_CODE_TO_PRIZE_CATEGORY);
