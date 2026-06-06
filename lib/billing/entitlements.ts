import "server-only";

import { MAX_ACTIVE_LISTINGS } from "@/lib/billing/plans";
import type { SubscriptionStatus } from "@/lib/db/enums";
import type { SubscriptionRow } from "@/lib/db/types";

// Active-listing capacity granted to a host without a usable plan
// (no_plan / canceled). Hosts must hold an active plan to keep listings live,
// so an inactive subscription grants zero active-listing capacity.
export const UNSUBSCRIBED_ACTIVE_LISTINGS = 0;

// Subscription states that still grant the purchased entitlement.
// `grace` covers Stripe `incomplete`/`paused`; `past_due` intentionally keeps
// capacity while payment is retried so a single failed charge does not yank
// live listings out from under a host.
const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "grace",
  "past_due",
]);

// States that should prompt the host to fix billing even though capacity is
// still honored for now.
const ATTENTION_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "grace",
  "past_due",
]);

export interface HostEntitlement {
  status: SubscriptionStatus;
  // True only when the plan is fully active (status === "active").
  planActive: boolean;
  // True when the purchased allowance is currently honored.
  isEntitled: boolean;
  // True when billing needs the host's attention (grace / past_due).
  requiresAttention: boolean;
  // Nominal capacity granted by the plan, only counted when entitled.
  includedActiveListings: number;
  purchasedAdditionalListings: number;
  // Allowance actually enforced right now, after applying status + the DB cap.
  effectiveAllowance: number;
  activeListingCount: number;
  remainingActiveSlots: number;
  // True when the host already has more active listings than currently allowed.
  isOverLimit: boolean;
  // True when the host can take one more listing live right now.
  canActivateListing: boolean;
}

function clampToDbCap(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 0), MAX_ACTIVE_LISTINGS);
}

// Compute a host's current listing entitlement from the latest subscription row
// and the number of listings already active. Resilient to a missing
// subscription and to incomplete / past_due / canceled states.
export function computeHostEntitlement(
  subscription: SubscriptionRow | null,
  activeListingCount: number,
): HostEntitlement {
  const status: SubscriptionStatus = subscription?.status ?? "no_plan";
  const isEntitled = ENTITLED_STATUSES.has(status);

  const nominalIncluded = subscription?.included_active_listings ?? 0;
  const nominalPurchased = subscription?.purchased_additional_listings ?? 0;
  const storedMax =
    subscription?.max_active_listings ?? nominalIncluded + nominalPurchased;

  const includedActiveListings = isEntitled ? nominalIncluded : 0;
  const purchasedAdditionalListings = isEntitled ? nominalPurchased : 0;
  const effectiveAllowance = isEntitled
    ? clampToDbCap(storedMax)
    : UNSUBSCRIBED_ACTIVE_LISTINGS;

  const normalizedActive = Math.max(Math.trunc(activeListingCount), 0);
  const remainingActiveSlots = Math.max(
    effectiveAllowance - normalizedActive,
    0,
  );

  return {
    status,
    planActive: status === "active",
    isEntitled,
    requiresAttention: ATTENTION_STATUSES.has(status),
    includedActiveListings,
    purchasedAdditionalListings,
    effectiveAllowance,
    activeListingCount: normalizedActive,
    remainingActiveSlots,
    isOverLimit: normalizedActive > effectiveAllowance,
    canActivateListing: remainingActiveSlots > 0,
  };
}

// Raised when a host cannot take another listing live under their current plan.
export class ListingQuotaError extends Error {
  readonly entitlement: HostEntitlement;

  constructor(entitlement: HostEntitlement) {
    super(
      entitlement.effectiveAllowance === 0
        ? "Active listing blocked: an active host plan is required to publish listings."
        : `Active listing blocked: plan allows ${entitlement.effectiveAllowance} active listing${
            entitlement.effectiveAllowance === 1 ? "" : "s"
          } and ${entitlement.activeListingCount} are already live.`,
    );
    this.name = "ListingQuotaError";
    this.entitlement = entitlement;
  }
}

// Throw a ListingQuotaError when the host cannot take another listing live.
// The database enforce_active_listing_cap trigger remains the hard backstop;
// this gives callers a clear, status-aware failure before the write.
export function assertHostCanActivateListing(
  entitlement: HostEntitlement,
): void {
  if (!entitlement.canActivateListing) {
    throw new ListingQuotaError(entitlement);
  }
}
