import type { PrizeCategory } from "@/lib/types/listing";

export interface ListingFallbackTheme {
  code: string;
  label: string;
  eyebrow: string;
}

const THEMES: Record<string, ListingFallbackTheme> = {
  cash: { code: "cash", label: "Cash prize", eyebrow: "Cash sweepstakes" },
  gift_cards: { code: "gift_cards", label: "Gift card", eyebrow: "Gift card giveaway" },
  travel: { code: "travel", label: "Travel prize", eyebrow: "Travel sweepstakes" },
  vehicles: { code: "vehicles", label: "Vehicle prize", eyebrow: "Vehicle giveaway" },
  electronics: { code: "electronics", label: "Tech prize", eyebrow: "Electronics giveaway" },
  outdoor: { code: "outdoor", label: "Outdoor prize", eyebrow: "Outdoor giveaway" },
  home: { code: "home", label: "Home prize", eyebrow: "Home sweepstakes" },
  food_beverage: { code: "food_beverage", label: "Food & drink", eyebrow: "Food & beverage prize" },
  fashion_beauty: { code: "fashion_beauty", label: "Style prize", eyebrow: "Beauty & fashion giveaway" },
  family_kids: { code: "family_kids", label: "Family prize", eyebrow: "Family giveaway" },
  experiences: { code: "experiences", label: "Experience prize", eyebrow: "Experience sweepstakes" },
  seasonal: { code: "seasonal", label: "Seasonal prize", eyebrow: "Seasonal sweepstakes" },
  other: { code: "other", label: "Prize giveaway", eyebrow: "Sweepstakes discovery" },
};

const DISPLAY_TO_CODE: Partial<Record<PrizeCategory, string>> = {
  Cash: "cash",
  "Gift Cards": "gift_cards",
  Travel: "travel",
  Vehicles: "vehicles",
  "Outdoor Gear": "outdoor",
  Electronics: "electronics",
  "Home Goods": "home",
  "Beauty/Fashion": "fashion_beauty",
  "Food/Beverage": "food_beverage",
  "Family/Kids": "family_kids",
  "Seasonal/Holiday": "seasonal",
};

export type ListingFallbackAssetName =
  | "cash-gift-card.webp"
  | "travel.webp"
  | "electronics.webp"
  | "general-prize.webp";

const ASSET_BY_CATEGORY: Record<string, ListingFallbackAssetName> = {
  cash: "cash-gift-card.webp",
  gift_cards: "general-prize.webp",
  travel: "travel.webp",
  experiences: "travel.webp",
  electronics: "electronics.webp",
  vehicles: "general-prize.webp",
  outdoor: "general-prize.webp",
  home: "general-prize.webp",
  food_beverage: "general-prize.webp",
  fashion_beauty: "general-prize.webp",
  family_kids: "general-prize.webp",
  seasonal: "general-prize.webp",
  other: "general-prize.webp",
};

const CATEGORY_BY_ASSET: Record<ListingFallbackAssetName, string> = {
  "cash-gift-card.webp": "cash",
  "travel.webp": "travel",
  "electronics.webp": "electronics",
  "general-prize.webp": "other",
};

const OWNED_FALLBACK_ASSET_PREFIX = "/images/listing-fallbacks/";
const OWNED_FALLBACK_ASSET_PATHS = new Set(
  Object.keys(CATEGORY_BY_ASSET).map(
    (assetName) => `${OWNED_FALLBACK_ASSET_PREFIX}${assetName}`,
  ),
);

const GENERATED_MEDIA_HOSTS = new Set([
  "sweepza.invalid",
  "sweepza.com",
  "www.sweepza.com",
]);

export function normalizeFallbackCategory(category: string | null | undefined): string {
  if (!category) return "other";
  if (THEMES[category]) return category;
  return DISPLAY_TO_CODE[category as PrizeCategory] ?? "other";
}

export function listingFallbackTheme(category: string | null | undefined): ListingFallbackTheme {
  return THEMES[normalizeFallbackCategory(category)] ?? THEMES.other;
}

export function listingFallbackImageUrl(category: string | null | undefined): string {
  return `/api/images/listing-fallback/${normalizeFallbackCategory(category)}`;
}

export function listingFallbackAssetUrl(
  category: string | null | undefined,
): string {
  const normalizedCategory = normalizeFallbackCategory(category);
  const assetName =
    ASSET_BY_CATEGORY[normalizedCategory] ?? ASSET_BY_CATEGORY.other;

  return `${OWNED_FALLBACK_ASSET_PREFIX}${assetName}`;
}

export function listingFallbackAltText(
  category: string | null | undefined,
): string {
  const theme = listingFallbackTheme(category);
  return `Representative photo for ${theme.label.toLowerCase()} listings; not the official promotion image.`;
}

export function isGeneratedListingFallbackUrl(
  sourceUrl: string | null | undefined,
): boolean {
  if (!sourceUrl) return false;
  try {
    const parsed = new URL(sourceUrl, "https://sweepza.invalid");
    return (
      GENERATED_MEDIA_HOSTS.has(parsed.hostname) &&
      (parsed.pathname.startsWith("/api/images/listing-fallback/") ||
        parsed.pathname === "/opengraph-image" ||
        OWNED_FALLBACK_ASSET_PATHS.has(parsed.pathname))
    );
  } catch {
    return false;
  }
}

/**
 * Category fallbacks may have been persisted as absolute production URLs.
 * Present them through the current deployment's owned static assets so a
 * release is not held behind the generated route's intentionally long CDN TTL.
 */
export function listingMediaPresentationUrl(
  sourceUrl: string | null | undefined,
  category?: string | null,
): string | undefined {
  if (!sourceUrl) return undefined;
  if (!isGeneratedListingFallbackUrl(sourceUrl)) return sourceUrl;

  const parsed = new URL(sourceUrl, "https://sweepza.invalid");
  const routeCategory = parsed.pathname.startsWith(
    "/api/images/listing-fallback/",
  )
    ? parsed.pathname.split("/").filter(Boolean).at(-1)
    : undefined;
  const ownedAssetName = parsed.pathname.startsWith(
    OWNED_FALLBACK_ASSET_PREFIX,
  )
    ? parsed.pathname.split("/").filter(Boolean).at(-1)
    : undefined;
  const ownedAssetCategory =
    ownedAssetName && ownedAssetName in CATEGORY_BY_ASSET
      ? CATEGORY_BY_ASSET[ownedAssetName as ListingFallbackAssetName]
      : undefined;
  const normalizedCategory = normalizeFallbackCategory(
    routeCategory
      ? decodeURIComponent(routeCategory)
      : category ?? ownedAssetCategory,
  );

  return listingFallbackAssetUrl(normalizedCategory);
}
