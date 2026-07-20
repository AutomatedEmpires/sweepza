import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentsEnabled: false,
  env: {
    NEXT_PUBLIC_APP_URL: "https://sweepza.com",
    STRIPE_SECRET_KEY: "sk_configured",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_configured",
    STRIPE_WEBHOOK_SECRET: "configured-webhook-secret",
    STRIPE_PRICE_HOST_BASELINE: "price_configured",
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/billing/payment-gate", () => ({
  isPaymentsEnabled: () => mocks.paymentsEnabled,
}));

import { GET } from "@/app/api/health/route";

describe("health payment status", () => {
  beforeEach(() => {
    mocks.paymentsEnabled = false;
  });

  it("reports configured Stripe resources separately from activation", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.integrations.stripe).toEqual({
      configured: true,
      enabled: false,
      ready: false,
      app: true,
      webhook: true,
      prices: true,
    });
  });

  it("reports ready only when configuration and activation are both present", async () => {
    mocks.paymentsEnabled = true;

    const response = await GET();
    const body = await response.json();

    expect(body.integrations.stripe.configured).toBe(true);
    expect(body.integrations.stripe.enabled).toBe(true);
    expect(body.integrations.stripe.ready).toBe(true);
    expect(body.ok).toBe(true);
  });

  it.each([
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_HOST_BASELINE",
    "NEXT_PUBLIC_APP_URL",
  ])("reports enabled but not ready when %s is absent", async (missingKey) => {
    mocks.paymentsEnabled = true;
    const prior = mocks.env[missingKey];
    mocks.env[missingKey] = undefined;

    const response = await GET();
    const body = await response.json();

    expect(body.integrations.stripe.configured).toBe(false);
    expect(body.integrations.stripe.enabled).toBe(true);
    expect(body.integrations.stripe.ready).toBe(false);
    expect(body.ok).toBe(false);
    mocks.env[missingKey] = prior;
  });
});
