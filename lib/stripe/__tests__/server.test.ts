import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    PAYMENTS_ENABLED: undefined as string | undefined,
    STRIPE_SECRET_KEY: "sk_test_must_not_be_used",
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
  createStripeServerClient,
  ensureStripeCustomerForHost,
} from "@/lib/stripe/server";

describe("Stripe server boundary", () => {
  beforeEach(() => {
    mocks.env.PAYMENTS_ENABLED = undefined;
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
});
