import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    PAYMENTS_ENABLED: undefined as string | undefined,
    NEXT_PUBLIC_APP_URL: "https://sweepza.com",
  },
  createStripeServerClient: vi.fn(),
  ensureStripeCustomerForHost: vi.fn(),
  getBaselinePriceId: vi.fn(),
  getAdditionalListingPriceId: vi.fn(),
  computePlanAllowance: vi.fn(),
  isBillingConfigured: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/stripe/server", () => ({
  createStripeServerClient: mocks.createStripeServerClient,
  ensureStripeCustomerForHost: mocks.ensureStripeCustomerForHost,
}));
vi.mock("@/lib/billing/plans", () => ({
  HOST_BASELINE_PLAN: { key: "host_baseline" },
  getBaselinePriceId: mocks.getBaselinePriceId,
  getAdditionalListingPriceId: mocks.getAdditionalListingPriceId,
  computePlanAllowance: mocks.computePlanAllowance,
  isBillingConfigured: mocks.isBillingConfigured,
}));

import {
  createHostCheckoutSession,
  createStripePortalSession,
} from "@/lib/stripe/checkout";

describe("Stripe checkout boundary", () => {
  beforeEach(() => {
    mocks.env.PAYMENTS_ENABLED = undefined;
    mocks.createStripeServerClient.mockReset();
    mocks.ensureStripeCustomerForHost.mockReset();
    mocks.getBaselinePriceId.mockReset();
    mocks.getAdditionalListingPriceId.mockReset();
    mocks.computePlanAllowance.mockReset();
    mocks.isBillingConfigured.mockReset();
  });

  it("blocks Checkout before reading prices or constructing a client", async () => {
    await expect(
      createHostCheckoutSession({ host: {} as never, appUser: {} as never }),
    ).rejects.toThrow(/Payments are disabled/);

    expect(mocks.getBaselinePriceId).not.toHaveBeenCalled();
    expect(mocks.ensureStripeCustomerForHost).not.toHaveBeenCalled();
    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
  });

  it("blocks portal creation before constructing a client", async () => {
    await expect(
      createStripePortalSession({ customerId: "cus_existing" }),
    ).rejects.toThrow(/Payments are disabled/);

    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
  });

  it("rejects an incomplete enabled tuple before customer creation", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.isBillingConfigured.mockReturnValue(false);

    await expect(
      createHostCheckoutSession({ host: {} as never, appUser: {} as never }),
    ).rejects.toThrow(/complete Stripe application/);

    expect(mocks.ensureStripeCustomerForHost).not.toHaveBeenCalled();
    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
  });

  it("creates the expected subscription Checkout only after the gate and tuple pass", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.isBillingConfigured.mockReturnValue(true);
    mocks.getBaselinePriceId.mockReturnValue("price_baseline");
    mocks.getAdditionalListingPriceId.mockReturnValue("price_additional");
    mocks.computePlanAllowance.mockReturnValue({
      includedActiveListings: 3,
      purchasedAdditionalListings: 2,
      maxActiveListings: 5,
    });
    mocks.ensureStripeCustomerForHost.mockResolvedValue({
      customerId: "cus_sweepza",
      host: {},
    });
    const create = vi.fn().mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.test/session",
    });
    mocks.createStripeServerClient.mockReturnValue({
      checkout: { sessions: { create } },
    });

    const result = await createHostCheckoutSession({
      host: { id: "host_1" } as never,
      appUser: { id: "user_1" } as never,
      additionalListings: 2,
    });

    expect(result).toEqual({
      sessionId: "cs_test",
      url: "https://checkout.stripe.test/session",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_sweepza",
        line_items: [
          { price: "price_baseline", quantity: 1 },
          { price: "price_additional", quantity: 2 },
        ],
        metadata: expect.objectContaining({
          venture: "sweepza",
          host_id: "host_1",
          max_active_listings: "5",
        }),
      }),
    );
  });
});
