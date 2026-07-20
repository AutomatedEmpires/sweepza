import { describe, expect, it } from "vitest";
import {
  inspectSubscriptionEntitlement,
  isExpectedRecurringPrice,
  isLiveStripeKey,
  toLocalSubscriptionStatus,
} from "../verify-live-checkout-helpers.mjs";

const baselinePriceId = "price_baseline";
const additionalPriceId = "price_additional";

function subscription({
  status = "active",
  included = "3",
  purchased = "0",
  max = "3",
  additionalQuantity = 0,
} = {}) {
  return {
    status,
    metadata: {
      included_active_listings: included,
      purchased_additional_listings: purchased,
      max_active_listings: max,
    },
    items: {
      data: [
        { price: { id: baselinePriceId }, quantity: 1 },
        ...(additionalQuantity > 0
          ? [{ price: { id: additionalPriceId }, quantity: additionalQuantity }]
          : []),
      ],
    },
  };
}

describe("live Stripe gate", () => {
  it("accepts only live secret or restricted keys", () => {
    expect(isLiveStripeKey("sk_live_example")).toBe(true);
    expect(isLiveStripeKey("rk_live_example")).toBe(true);
    expect(isLiveStripeKey("sk_test_example")).toBe(false);
    expect(isLiveStripeKey("rk_test_example")).toBe(false);
    expect(isLiveStripeKey(undefined)).toBe(false);
  });
});

describe("subscription status comparison", () => {
  it.each([
    ["active", "active"],
    ["trialing", "active"],
    ["past_due", "past_due"],
    ["unpaid", "past_due"],
    ["canceled", "canceled"],
    ["incomplete_expired", "canceled"],
    ["paused", "grace"],
    ["incomplete", "grace"],
  ])("maps Stripe %s to local %s", (stripeStatus, localStatus) => {
    expect(toLocalSubscriptionStatus(stripeStatus)).toBe(localStatus);
  });
});

describe("slot entitlement proof", () => {
  it("requires the baseline checkout to grant exactly three slots", () => {
    expect(
      inspectSubscriptionEntitlement(
        subscription(),
        baselinePriceId,
        additionalPriceId,
      ),
    ).toMatchObject({
      valid: true,
      included: 3,
      purchased: 0,
      max: 3,
      expectedMax: 3,
    });
  });

  it("rejects incorrect baseline entitlement metadata", () => {
    expect(
      inspectSubscriptionEntitlement(
        subscription({ included: "1", max: "1" }),
        baselinePriceId,
        additionalPriceId,
      ).valid,
    ).toBe(false);
  });

  it("reconciles add-on quantity with purchased and maximum slots", () => {
    expect(
      inspectSubscriptionEntitlement(
        subscription({ purchased: "2", max: "5", additionalQuantity: 2 }),
        baselinePriceId,
        additionalPriceId,
      ),
    ).toMatchObject({
      valid: true,
      included: 3,
      additionalQuantity: 2,
      purchased: 2,
      max: 5,
      expectedMax: 5,
    });
  });
});

describe("price ownership proof", () => {
  it("requires a live monthly USD price on the expected Sweepza product", () => {
    const price = {
      livemode: true,
      active: true,
      unit_amount: 500,
      currency: "usd",
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
      product: {
        active: true,
        metadata: {
          venture: "sweepza",
          sweepza_key: "sweepza_additional_listing",
        },
      },
    };

    expect(
      isExpectedRecurringPrice(price, {
        unitAmount: 500,
        lookupKey: "sweepza_additional_listing",
      }),
    ).toBe(true);
    expect(
      isExpectedRecurringPrice(
        { ...price, livemode: false },
        { unitAmount: 500, lookupKey: "sweepza_additional_listing" },
      ),
    ).toBe(false);
    expect(
      isExpectedRecurringPrice(
        {
          ...price,
          recurring: {
            interval: "month",
            interval_count: 1,
            usage_type: "metered",
          },
        },
        { unitAmount: 500, lookupKey: "sweepza_additional_listing" },
      ),
    ).toBe(false);
  });
});
