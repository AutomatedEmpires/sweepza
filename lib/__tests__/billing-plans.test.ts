import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    STRIPE_SECRET_KEY: "sk_configured",
    STRIPE_ACCOUNT_ID: "acct_configured",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_configured",
    STRIPE_WEBHOOK_SECRET: "configured-webhook-secret",
    STRIPE_PRICE_HOST_BASELINE: "price_configured",
    NEXT_PUBLIC_APP_URL: "https://sweepza.com",
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));

import {
  getEffectiveListingAllowance,
  isBillingConfigured,
} from "@/lib/billing/plans";

describe("billing plans", () => {
  beforeEach(() => {
    Object.assign(mocks.env, {
      VERCEL_ENV: undefined,
      STRIPE_SECRET_KEY: "sk_configured",
      STRIPE_ACCOUNT_ID: "acct_configured",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_configured",
      STRIPE_WEBHOOK_SECRET: "configured-webhook-secret",
      STRIPE_PRICE_HOST_BASELINE: "price_configured",
      NEXT_PUBLIC_APP_URL: "https://sweepza.com",
    });
  });

  it.each(["no_plan", "incomplete", "paused", "past_due", "canceled"])(
    "does not grant paid capacity to %s subscriptions",
    (status) => {
      expect(
        getEffectiveListingAllowance({
          status,
          included_active_listings: 3,
          purchased_additional_listings: 7,
        }),
      ).toBe(1);
    },
  );

  it.each(["active", "grace"])(
    "uses capped paid capacity for %s subscriptions",
    (status) => {
      expect(
        getEffectiveListingAllowance({
          status,
          included_active_listings: 3,
          purchased_additional_listings: 9,
        }),
      ).toBe(10);
    },
  );

  it("requires the complete server tuple before showing Checkout", () => {
    expect(isBillingConfigured()).toBe(true);

    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_ACCOUNT_ID",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_HOST_BASELINE",
      "NEXT_PUBLIC_APP_URL",
    ]) {
      const prior = mocks.env[key];
      mocks.env[key] = undefined;
      expect(isBillingConfigured(), key).toBe(false);
      mocks.env[key] = prior;
    }
  });

  it.each([
    ["sk_test_sweepza", "pk_live_sweepza", "test secret key"],
    ["sk_live_sweepza", "pk_test_sweepza", "test publishable key"],
  ])(
    "rejects a production billing tuple that contains a %s (%s)",
    (secretKey, publishableKey) => {
      mocks.env.VERCEL_ENV = "production";
      mocks.env.STRIPE_SECRET_KEY = secretKey;
      mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = publishableKey;

      expect(isBillingConfigured()).toBe(false);
    },
  );

  it.each(["sk_live_sweepza", "rk_live_sweepza"])(
    "accepts a complete production tuple with the valid %s secret prefix",
    (secretKey) => {
      mocks.env.VERCEL_ENV = "production";
      mocks.env.STRIPE_SECRET_KEY = secretKey;
      mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_sweepza";

      expect(isBillingConfigured()).toBe(true);
    },
  );
});
