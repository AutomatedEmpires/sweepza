import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    PAYMENTS_ENABLED: undefined as string | undefined,
    NEXT_PUBLIC_APP_URL: "https://sweepza.com",
  },
  createStripeServerClient: vi.fn(),
  assertStripeAccountBinding: vi.fn(),
  assertStripeCustomerBinding: vi.fn(),
  ensureStripeCustomerForHost: vi.fn(),
  getBaselinePriceId: vi.fn(),
  getAdditionalListingPriceId: vi.fn(),
  computePlanAllowance: vi.fn(),
  getMaxAdditionalListings: vi.fn(),
  isBillingConfigured: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/stripe/server", () => ({
  createStripeServerClient: mocks.createStripeServerClient,
  assertStripeAccountBinding: mocks.assertStripeAccountBinding,
  assertStripeCustomerBinding: mocks.assertStripeCustomerBinding,
  ensureStripeCustomerForHost: mocks.ensureStripeCustomerForHost,
}));
vi.mock("@/lib/billing/plans", () => ({
  HOST_BASELINE_PLAN: { key: "host_baseline" },
  getBaselinePriceId: mocks.getBaselinePriceId,
  getAdditionalListingPriceId: mocks.getAdditionalListingPriceId,
  computePlanAllowance: mocks.computePlanAllowance,
  getMaxAdditionalListings: mocks.getMaxAdditionalListings,
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
    mocks.assertStripeAccountBinding.mockReset();
    mocks.assertStripeCustomerBinding.mockReset();
    mocks.ensureStripeCustomerForHost.mockReset();
    mocks.getBaselinePriceId.mockReset();
    mocks.getAdditionalListingPriceId.mockReset();
    mocks.computePlanAllowance.mockReset();
    mocks.getMaxAdditionalListings.mockReset();
    mocks.isBillingConfigured.mockReset();
    mocks.getMaxAdditionalListings.mockReturnValue(20);
    mocks.assertStripeAccountBinding.mockResolvedValue(undefined);
    mocks.assertStripeCustomerBinding.mockResolvedValue(undefined);
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
      createStripePortalSession({
        customerId: "cus_existing",
        hostId: "host_1",
      }),
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

  it("rejects suspended hosts before customer or Checkout operations", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.isBillingConfigured.mockReturnValue(true);

    await expect(
      createHostCheckoutSession({
        host: { id: "host_suspended", account_status: "suspended" } as never,
        appUser: { id: "user_1" } as never,
      }),
    ).rejects.toThrow(/Only an active host account can start Checkout/);

    expect(mocks.getBaselinePriceId).not.toHaveBeenCalled();
    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
    expect(mocks.assertStripeAccountBinding).not.toHaveBeenCalled();
    expect(mocks.ensureStripeCustomerForHost).not.toHaveBeenCalled();
  });

  it("keeps the billing portal available for an existing customer", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    const create = vi.fn().mockResolvedValue({
      url: "https://billing.stripe.test/session",
    });
    const stripe = { billingPortal: { sessions: { create } } };
    mocks.createStripeServerClient.mockReturnValue(stripe);

    await expect(
      createStripePortalSession({
        customerId: "cus_existing",
        hostId: "host_1",
      }),
    ).resolves.toBe("https://billing.stripe.test/session");

    expect(mocks.assertStripeAccountBinding).toHaveBeenCalledWith(stripe);
    expect(mocks.assertStripeCustomerBinding).toHaveBeenCalledWith(
      stripe,
      "cus_existing",
      "host_1",
    );
    expect(create).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://sweepza.com/host",
    });
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
    const stripe = {
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
      checkout: {
        sessions: {
          list: vi.fn().mockResolvedValue({ data: [] }),
          expire: vi.fn(),
          create,
        },
      },
    };
    mocks.createStripeServerClient.mockReturnValue(stripe);

    const result = await createHostCheckoutSession({
      host: { id: "host_1", account_status: "active" } as never,
      appUser: { id: "user_1" } as never,
      additionalListings: 2,
    });

    expect(result).toEqual({
      sessionId: "cs_test",
      url: "https://checkout.stripe.test/session",
    });
    expect(mocks.assertStripeAccountBinding).toHaveBeenCalledWith(stripe);
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
          checkout_shape: expect.stringMatching(/^[a-f0-9]{16}$/),
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^sweepza\/checkout\/host_1\/[a-f0-9]{16}$/,
        ),
      }),
    );
  });

  it("uses one fail-closed idempotency key for concurrent allowance shapes in the same generation", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.isBillingConfigured.mockReturnValue(true);
    mocks.getBaselinePriceId.mockReturnValue("price_baseline");
    mocks.getAdditionalListingPriceId.mockReturnValue("price_additional");
    mocks.computePlanAllowance.mockImplementation((additional: number) => ({
      includedActiveListings: 3,
      purchasedAdditionalListings: additional,
      maxActiveListings: 3 + additional,
    }));
    mocks.ensureStripeCustomerForHost.mockResolvedValue({
      customerId: "cus_sweepza",
      host: {},
    });
    const create = vi.fn().mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.test/session",
    });
    const stripe = {
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
      checkout: {
        sessions: {
          list: vi.fn().mockResolvedValue({ data: [] }),
          expire: vi.fn(),
          create,
        },
      },
    };
    mocks.createStripeServerClient.mockReturnValue(stripe);
    await createHostCheckoutSession({
      host: { id: "host_1", account_status: "active" } as never,
      appUser: { id: "user_1" } as never,
      additionalListings: 0,
    });
    await createHostCheckoutSession({
      host: { id: "host_1", account_status: "active" } as never,
      appUser: { id: "user_1" } as never,
      additionalListings: 2,
    });

    const firstKey = create.mock.calls[0]?.[1]?.idempotencyKey;
    const secondKey = create.mock.calls[1]?.[1]?.idempotencyKey;
    expect(firstKey).toMatch(/^sweepza\/checkout\/host_1\/[a-f0-9]{16}$/);
    expect(secondKey).toMatch(/^sweepza\/checkout\/host_1\/[a-f0-9]{16}$/);
    expect(firstKey).toBe(secondKey);
  });

  it("does not reuse an open session whose price or plan shape is stale", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.isBillingConfigured.mockReturnValue(true);
    mocks.getBaselinePriceId.mockReturnValue("price_current");
    mocks.computePlanAllowance.mockReturnValue({
      includedActiveListings: 3,
      purchasedAdditionalListings: 0,
      maxActiveListings: 3,
    });
    mocks.ensureStripeCustomerForHost.mockResolvedValue({
      customerId: "cus_sweepza",
      host: {},
    });
    const expire = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({
      id: "cs_current",
      url: "https://checkout.stripe.test/current",
    });
    mocks.createStripeServerClient.mockReturnValue({
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
      checkout: {
        sessions: {
          list: vi.fn().mockResolvedValue({
            data: [
              {
                id: "cs_stale_price",
                status: "open",
                mode: "subscription",
                url: "https://checkout.stripe.test/stale",
                metadata: {
                  venture: "sweepza",
                  host_id: "host_1",
                  max_active_listings: "3",
                  checkout_shape: "0000000000000000",
                },
              },
            ],
          }),
          expire,
          create,
        },
      },
    });

    await expect(
      createHostCheckoutSession({
        host: { id: "host_1", account_status: "active" } as never,
        appUser: { id: "user_1" } as never,
        additionalListings: 0,
      }),
    ).resolves.toEqual({
      sessionId: "cs_current",
      url: "https://checkout.stripe.test/current",
    });

    expect(expire).toHaveBeenCalledWith("cs_stale_price");
    expect(create).toHaveBeenCalledOnce();
  });

  it("advances the idempotency generation when switching back to an expired allowance", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.isBillingConfigured.mockReturnValue(true);
    mocks.getBaselinePriceId.mockReturnValue("price_baseline");
    mocks.getAdditionalListingPriceId.mockReturnValue("price_additional");
    mocks.computePlanAllowance.mockImplementation((additional: number) => ({
      includedActiveListings: 3,
      purchasedAdditionalListings: additional,
      maxActiveListings: 3 + additional,
    }));
    mocks.ensureStripeCustomerForHost.mockResolvedValue({
      customerId: "cus_sweepza",
      host: {},
    });

    const session = (
      id: string,
      status: "open" | "expired",
      maxActiveListings: number,
    ) => ({
      id,
      status,
      mode: "subscription",
      url: status === "open" ? `https://checkout.stripe.test/${id}` : null,
      metadata: {
        venture: "sweepza",
        host_id: "host_1",
        max_active_listings: String(maxActiveListings),
      },
    });
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [session("cs_a", "open", 3)] })
      .mockResolvedValueOnce({
        data: [
          session("cs_b", "open", 5),
          session("cs_a", "expired", 3),
        ],
      });
    const expire = vi.fn().mockResolvedValue({});
    const create = vi
      .fn()
      .mockResolvedValueOnce(session("cs_a", "open", 3))
      .mockResolvedValueOnce(session("cs_b", "open", 5))
      .mockResolvedValueOnce(session("cs_a2", "open", 3));
    mocks.createStripeServerClient.mockReturnValue({
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
      checkout: { sessions: { list, expire, create } },
    });

    const checkout = (additionalListings: number) =>
      createHostCheckoutSession({
        host: { id: "host_1", account_status: "active" } as never,
        appUser: { id: "user_1" } as never,
        additionalListings,
      });

    await checkout(0);
    await checkout(2);
    await checkout(0);

    const firstAllowanceKey = create.mock.calls[0]?.[1]?.idempotencyKey;
    const repeatedAllowanceKey = create.mock.calls[2]?.[1]?.idempotencyKey;
    expect(firstAllowanceKey).not.toBe(repeatedAllowanceKey);
    expect(expire).toHaveBeenNthCalledWith(1, "cs_a");
    expect(expire).toHaveBeenNthCalledWith(2, "cs_b");
  });
});
