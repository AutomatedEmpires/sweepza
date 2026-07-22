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
    const retrieve = vi.fn();

    await expect(
      assertStripeAccountBinding({ accounts: { retrieve } } as never),
    ).rejects.toThrow(/production payments require live Stripe credentials/);

    expect(retrieve).not.toHaveBeenCalled();
  });
});
