import "server-only";

import { env } from "@/lib/env";

// Hard cap enforced in the database
// (subscription.max_active_listings CHECK <= 10). Keep this in sync with the
// billing_notifications migration if the cap ever changes.
export const MAX_ACTIVE_LISTINGS = 10;

// One clear baseline host plan. Pricing itself lives in the Stripe Dashboard
// and is referenced here by price ID; this object only describes the
// entitlement the plan grants. Keep it explicit and easy to tune.
export const HOST_BASELINE_PLAN = {
  key: "host_baseline",
  name: "Host plan",
  // Active-listing slots included with the baseline subscription.
  includedActiveListings: 3,
  priceEnvKey: "STRIPE_PRICE_HOST_BASELINE",
} as const;

// Optional add-on: extra active-listing capacity, sold in single-slot units.
export const ADDITIONAL_LISTING_ADDON = {
  key: "additional_listing",
  name: "Extra active listing",
  priceEnvKey: "STRIPE_PRICE_ADDITIONAL_LISTING",
} as const;

export function getBaselinePriceId(): string | null {
  return env.STRIPE_PRICE_HOST_BASELINE ?? null;
}

export function getAdditionalListingPriceId(): string | null {
  return env.STRIPE_PRICE_ADDITIONAL_LISTING ?? null;
}

// Maximum additional slots a host can buy on top of the baseline plan without
// exceeding the database active-listing cap.
export function getMaxAdditionalListings(): number {
  return Math.max(
    MAX_ACTIVE_LISTINGS - HOST_BASELINE_PLAN.includedActiveListings,
    0,
  );
}

export interface PlanAllowance {
  includedActiveListings: number;
  purchasedAdditionalListings: number;
  maxActiveListings: number;
}

// Compute a clean, DB-safe allowance for a baseline purchase plus add-ons.
// The result maps 1:1 onto the subscription row columns.
export function computePlanAllowance(additionalListings: number): PlanAllowance {
  const clampedAdditional = Math.min(
    Math.max(Math.trunc(additionalListings), 0),
    getMaxAdditionalListings(),
  );
  const includedActiveListings = HOST_BASELINE_PLAN.includedActiveListings;
  const maxActiveListings = Math.min(
    includedActiveListings + clampedAdditional,
    MAX_ACTIVE_LISTINGS,
  );

  return {
    includedActiveListings,
    purchasedAdditionalListings: clampedAdditional,
    maxActiveListings,
  };
}

// True when the baseline plan can actually be purchased in this environment.
export function isBillingConfigured(): boolean {
  return Boolean(getBaselinePriceId());
}
