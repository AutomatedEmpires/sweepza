import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    PAYMENTS_ENABLED: undefined as string | undefined,
    STRIPE_SECRET_KEY: "sk_test_must_not_be_used",
    STRIPE_ACCOUNT_ID: "acct_1TeqgHD7Yqq488pB",
    VERCEL_ENV: undefined as string | undefined,
  },
  stripeConstructor: vi.fn(),
  updateHostStripeCustomerId: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("stripe", () => ({ default: mocks.stripeConstructor }));
vi.mock("@/lib/db/hosts", () => ({
  updateHostStripeCustomerId: mocks.updateHostStripeCustomerId,
}));

import {
  assertStripeAccountBinding,
  assertStripeCustomerBinding,
  createStripeServerClient,
  ensureStripeCustomerForHost,
} from "@/lib/stripe/server";

describe("Stripe server boundary", () => {
  beforeEach(() => {
    mocks.env.PAYMENTS_ENABLED = undefined;
    mocks.env.STRIPE_SECRET_KEY = "sk_test_must_not_be_used";
    mocks.env.STRIPE_ACCOUNT_ID = "acct_1TeqgHD7Yqq488pB";
    mocks.env.VERCEL_ENV = undefined;
    mocks.stripeConstructor.mockReset();
    mocks.updateHostStripeCustomerId.mockReset();
  });

  it("does not construct a Stripe client when credentials exist but the gate is off", () => {
    expect(() => createStripeServerClient()).toThrow(/Payments are disabled/);
    expect(mocks.stripeConstructor).not.toHaveBeenCalled();
  });

  it("blocks even an already-associated customer before returning or mutating", async () => {
    await expect(
      ensureStripeCustomerForHost(
        { stripe_customer_id: "cus_existing" } as never,
        { email: "host@example.test" } as never,
      ),
    ).rejects.toThrow(/Payments are disabled/);

    expect(mocks.stripeConstructor).not.toHaveBeenCalled();
    expect(mocks.updateHostStripeCustomerId).not.toHaveBeenCalled();
  });

  it("rejects test-mode credentials in production before calling Stripe", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.env.VERCEL_ENV = "production";
    mocks.env.STRIPE_SECRET_KEY = "sk_test_sweepza";
    const retrieveCurrent = vi.fn();

    await expect(
      assertStripeAccountBinding({ accounts: { retrieveCurrent } } as never),
    ).rejects.toThrow(/production payments require live Stripe credentials/);

    expect(retrieveCurrent).not.toHaveBeenCalled();
  });

  it("rejects credentials whose authenticated platform account differs from the approved binding", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.env.STRIPE_SECRET_KEY = "sk_test_sweepza";
    const retrieveCurrent = vi.fn().mockResolvedValue({
      id: "acct_connected_or_other_venture",
      charges_enabled: true,
      payouts_enabled: true,
    });

    await expect(
      assertStripeAccountBinding(
        { accounts: { retrieveCurrent } } as never,
        false,
      ),
    ).rejects.toThrow(/credentials resolve to a different account/);

    expect(retrieveCurrent).toHaveBeenCalledTimes(1);
    expect(retrieveCurrent).toHaveBeenCalledWith();
  });

  it("verifies the account authenticated by the approved test key without an account argument", async () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    mocks.env.STRIPE_SECRET_KEY = "sk_test_sweepza";
    const retrieveCurrent = vi.fn().mockResolvedValue({
      id: "acct_1TeqgHD7Yqq488pB",
      charges_enabled: false,
      payouts_enabled: false,
    });

    await expect(
      assertStripeAccountBinding(
        { accounts: { retrieveCurrent } } as never,
        false,
      ),
    ).resolves.toBeUndefined();

    expect(retrieveCurrent).toHaveBeenCalledTimes(1);
    expect(retrieveCurrent).toHaveBeenCalledWith();
  });

  it.each([
    {
      label: "another venture",
      customer: {
        id: "cus_wrong_venture",
        deleted: false,
        metadata: { venture: "other", host_id: "host_1" },
      },
    },
    {
      label: "another host",
      customer: {
        id: "cus_wrong_host",
        deleted: false,
        metadata: { venture: "sweepza", host_id: "host_2" },
      },
    },
    {
      label: "a deleted customer",
      customer: { id: "cus_deleted", deleted: true },
    },
  ])("rejects a persisted customer bound to $label", async ({ customer }) => {
    const retrieve = vi.fn().mockResolvedValue(customer);

    await expect(
      assertStripeCustomerBinding(
        { customers: { retrieve } } as never,
        customer.id,
        "host_1",
      ),
    ).rejects.toThrow(/not bound to this Sweepza host/);

    expect(retrieve).toHaveBeenCalledWith(customer.id);
  });

  it("accepts only a live customer with exact Sweepza host metadata", async () => {
    const customer = {
      id: "cus_sweepza",
      deleted: false,
      metadata: { venture: "sweepza", host_id: "host_1" },
    };
    const retrieve = vi.fn().mockResolvedValue(customer);

    await expect(
      assertStripeCustomerBinding(
        { customers: { retrieve } } as never,
        customer.id,
        "host_1",
      ),
    ).resolves.toEqual(customer);
  });
});
