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
