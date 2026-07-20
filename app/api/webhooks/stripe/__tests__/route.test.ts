import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: false,
  env: { STRIPE_WEBHOOK_SECRET: "whsec_must_not_be_used" },
  headers: vi.fn(),
  createStripeServerClient: vi.fn(),
  getHostByStripeCustomerId: vi.fn(),
  upsertSubscriptionFromStripe: vi.fn(),
}));

vi.mock("@/lib/billing/payment-gate", () => ({
  isPaymentsEnabled: () => mocks.enabled,
  PAYMENTS_DISABLED_REASON: "payments_disabled",
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/stripe/server", () => ({
  createStripeServerClient: mocks.createStripeServerClient,
}));
vi.mock("@/lib/db/subscriptions", () => ({
  getHostByStripeCustomerId: mocks.getHostByStripeCustomerId,
  upsertSubscriptionFromStripe: mocks.upsertSubscriptionFromStripe,
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/stripe/route";

describe("Stripe webhook payment gate", () => {
  beforeEach(() => {
    mocks.enabled = false;
    mocks.env.STRIPE_WEBHOOK_SECRET = "whsec_must_not_be_used";
    mocks.headers.mockReset();
    mocks.createStripeServerClient.mockReset();
    mocks.getHostByStripeCustomerId.mockReset();
    mocks.upsertSubscriptionFromStripe.mockReset();
  });

  it("returns a successful no-op before reading credentials, body, or database", async () => {
    const request = new Request("https://sweepza.com/api/webhooks/stripe", {
      method: "POST",
      body: "must-not-be-read",
    });
    const bodySpy = vi.spyOn(request, "text");

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Payments are disabled; retry after an authorized activation.",
      disabled: true,
      reason: "payments_disabled",
    });
    expect(bodySpy).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
    expect(mocks.getHostByStripeCustomerId).not.toHaveBeenCalled();
    expect(mocks.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it("retains the configured-route failure when the gate is on but the secret is absent", async () => {
    mocks.enabled = true;
    mocks.env.STRIPE_WEBHOOK_SECRET = undefined as never;

    const response = await POST(
      new Request("https://sweepza.com/api/webhooks/stripe", { method: "POST" }),
    );

    expect(response.status).toBe(503);
    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
  });

  it("verifies but does not mutate an unrelated event when enabled", async () => {
    mocks.enabled = true;
    mocks.headers.mockResolvedValue({ get: () => "signature" });
    const constructEventAsync = vi.fn().mockResolvedValue({
      type: "invoice.created",
      data: { object: {} },
    });
    mocks.createStripeServerClient.mockReturnValue({
      webhooks: { constructEventAsync },
    });

    const response = await POST(
      new Request("https://sweepza.com/api/webhooks/stripe", {
        method: "POST",
        body: "signed-payload",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "ignored",
      eventType: "invoice.created",
    });
    expect(constructEventAsync).toHaveBeenCalledWith(
      "signed-payload",
      "signature",
      "whsec_must_not_be_used",
    );
    expect(mocks.getHostByStripeCustomerId).not.toHaveBeenCalled();
    expect(mocks.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
  });
});
