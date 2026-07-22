import type { PrizeCategory } from "@/lib/types/listing";

export interface ListingFallbackTheme {
  code: string;
  label: string;
  eyebrow: string;
  from: string;
  to: string;
  accent: string;
}

const THEMES: Record<string, ListingFallbackTheme> = {
  cash: { code: "cash", label: "Cash prize", eyebrow: "Cash sweepstakes", from: "#25102f", to: "#71378c", accent: "#f2c45e" },
  gift_cards: { code: "gift_cards", label: "Gift card", eyebrow: "Gift card giveaway", from: "#2a1434", to: "#9a3e87", accent: "#f4cf76" },
  travel: { code: "travel", label: "Travel prize", eyebrow: "Travel sweepstakes", from: "#0d2f3f", to: "#246d77", accent: "#f3c96d" },
  vehicles: { code: "vehicles", label: "Vehicle prize", eyebrow: "Vehicle giveaway", from: "#251922", to: "#813e42", accent: "#f1c362" },
  electronics: { code: "electronics", label: "Tech prize", eyebrow: "Electronics giveaway", from: "#131d3e", to: "#49429a", accent: "#d8c66b" },
  outdoor: { code: "outdoor", label: "Outdoor prize", eyebrow: "Outdoor giveaway", from: "#123127", to: "#3e7451", accent: "#efc866" },
  home: { code: "home", label: "Home prize", eyebrow: "Home sweepstakes", from: "#332118", to: "#8b5f40", accent: "#f0c777" },
  food_beverage: { code: "food_beverage", label: "Food & drink", eyebrow: "Food & beverage prize", from: "#3b171c", to: "#9d4a39", accent: "#f4c96c" },
  fashion_beauty: { code: "fashion_beauty", label: "Style prize", eyebrow: "Beauty & fashion giveaway", from: "#35132d", to: "#9e4f83", accent: "#f2c9a6" },
  family_kids: { code: "family_kids", label: "Family prize", eyebrow: "Family giveaway", from: "#17304a", to: "#4574a6", accent: "#f6ca61" },
  experiences: { code: "experiences", label: "Experience prize", eyebrow: "Experience sweepstakes", from: "#21214a", to: "#73539a", accent: "#efc663" },
  seasonal: { code: "seasonal", label: "Seasonal prize", eyebrow: "Seasonal sweepstakes", from: "#243124", to: "#7c3f4a", accent: "#f0cf75" },
  other: { code: "other", label: "Prize giveaway", eyebrow: "Sweepstakes discovery", from: "#21112c", to: "#653078", accent: "#f3c867" },
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

