import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: false,
  env: { STRIPE_WEBHOOK_SECRET: "whsec_sweepza_test" } as {
    STRIPE_WEBHOOK_SECRET?: string;
  },
  headers: vi.fn(),
  createStripeServerClient: vi.fn(),
  assertStripeAccountBinding: vi.fn(),
  getHostByStripeCustomerId: vi.fn(),
  applySubscriptionEventFromStripe: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/billing/payment-gate", () => ({
  isPaymentsEnabled: () => mocks.enabled,
  PAYMENTS_DISABLED_REASON: "payments_disabled",
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/stripe/server", () => ({
  createStripeServerClient: mocks.createStripeServerClient,
  assertStripeAccountBinding: mocks.assertStripeAccountBinding,
}));
vi.mock("@/lib/db/subscriptions", () => ({
  getHostByStripeCustomerId: mocks.getHostByStripeCustomerId,
  applySubscriptionEventFromStripe: mocks.applySubscriptionEventFromStripe,
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
  captureException: mocks.captureException,
}));

import { POST } from "@/app/api/webhooks/stripe/route";

function request(): Request {
  return new Request("https://sweepza.com/api/webhooks/stripe", {
    method: "POST",
    body: "signed-payload",
  });
}

function subscriptionEvent(
  type:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted" = "customer.subscription.updated",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "evt_1",
    type,
    created: 1_800_000_000,
    livemode: false,
    data: {
      object: { id: "sub_1", customer: "cus_1", status: "active" },
    },
    ...overrides,
  };
}

function configureStripe(event: unknown, retrieved?: unknown) {
  const retrieve = vi.fn().mockResolvedValue(
    retrieved ?? { id: "sub_1", customer: "cus_1", status: "active" },
  );
  const constructEventAsync = vi.fn().mockResolvedValue(event);
  const stripe = {
    webhooks: { constructEventAsync },
    subscriptions: { retrieve },
  };
  mocks.createStripeServerClient.mockReturnValue(stripe);
  return { stripe, retrieve, constructEventAsync };
}

describe("Stripe webhook boundary", () => {
  beforeEach(() => {
    mocks.enabled = false;
    mocks.env.STRIPE_WEBHOOK_SECRET = "whsec_sweepza_test";
    mocks.headers.mockReset();
    mocks.headers.mockResolvedValue({ get: () => "signature" });
    mocks.createStripeServerClient.mockReset();
    mocks.assertStripeAccountBinding.mockReset();
    mocks.assertStripeAccountBinding.mockResolvedValue(undefined);
    mocks.getHostByStripeCustomerId.mockReset();
    mocks.applySubscriptionEventFromStripe.mockReset();
    mocks.captureMessage.mockReset();
    mocks.captureException.mockReset();
  });

  it("fails closed before reading credentials, body, or database when payments are disabled", async () => {
    const webhookRequest = request();
    const bodySpy = vi.spyOn(webhookRequest, "text");

    const response = await POST(webhookRequest);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Payments are disabled; retry after an authorized activation.",
      disabled: true,
      reason: "payments_disabled",
    });
    expect(bodySpy).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
  });

  it("returns 503 before creating a Stripe client when the webhook secret is absent", async () => {
    mocks.enabled = true;
    mocks.env.STRIPE_WEBHOOK_SECRET = undefined;

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.createStripeServerClient).not.toHaveBeenCalled();
  });

  it("does not echo Stripe verifier details", async () => {
    mocks.enabled = true;
    const constructEventAsync = vi
      .fn()
      .mockRejectedValue(new Error("No signatures found matching secret whsec_sensitive"));
    mocks.createStripeServerClient.mockReturnValue({
      webhooks: { constructEventAsync },
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook verification failed.",
    });
  });

  it("verifies but does not mutate an unrelated event", async () => {
    mocks.enabled = true;
    const { constructEventAsync } = configureStripe({
      id: "evt_invoice",
      type: "invoice.created",
      data: { object: {} },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "ignored",
      eventType: "invoice.created",
    });
    expect(constructEventAsync).toHaveBeenCalledWith(
      "signed-payload",
      "signature",
      "whsec_sweepza_test",
    );
    expect(mocks.assertStripeAccountBinding).not.toHaveBeenCalled();
  });

  it.each([
    ["processed", "subscription_synced"],
    ["duplicate", "subscription_ignored"],
    ["ignored_stale", "subscription_ignored"],
    ["ignored_superseded", "subscription_ignored"],
  ] as const)("returns the %s database-ledger outcome", async (outcome, action) => {
    mocks.enabled = true;
    const event = subscriptionEvent();
    const retrieved = { id: "sub_1", customer: "cus_1", status: "active" };
    const { stripe } = configureStripe(event, retrieved);
    mocks.getHostByStripeCustomerId.mockResolvedValue({ id: "host_1" });
    mocks.applySubscriptionEventFromStripe.mockResolvedValue({
      outcome,
      subscriptionId: "local_sub_1",
      status: "active",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, action, outcome, hostId: "host_1" });
    expect(mocks.assertStripeAccountBinding).toHaveBeenCalledWith(stripe, false);
    expect(mocks.applySubscriptionEventFromStripe).toHaveBeenCalledWith(
      "host_1",
      event,
      retrieved,
    );
  });

  it("rejects connected-account events before subscription retrieval", async () => {
    mocks.enabled = true;
    const { retrieve } = configureStripe(
      subscriptionEvent("customer.subscription.updated", { account: "acct_connected" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(retrieve).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it("pages and returns 404 when no Sweepza host owns the customer", async () => {
    mocks.enabled = true;
    configureStripe(subscriptionEvent());
    mocks.getHostByStripeCustomerId.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.captureMessage).toHaveBeenCalledOnce();
    expect(mocks.applySubscriptionEventFromStripe).not.toHaveBeenCalled();
  });

  it("uses the signed payload only as a deletion fallback", async () => {
    mocks.enabled = true;
    const event = subscriptionEvent("customer.subscription.deleted");
    const { retrieve } = configureStripe(event);
    retrieve.mockRejectedValue(new Error("already deleted"));
    mocks.getHostByStripeCustomerId.mockResolvedValue({ id: "host_1" });
    mocks.applySubscriptionEventFromStripe.mockResolvedValue({
      outcome: "processed",
      subscriptionId: "local_sub_1",
      status: "canceled",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.applySubscriptionEventFromStripe).toHaveBeenCalledWith(
      "host_1",
      event,
      event.data.object,
    );
  });

  it("retries when a non-deletion subscription cannot be retrieved", async () => {
    mocks.enabled = true;
    const { retrieve } = configureStripe(subscriptionEvent());
    retrieve.mockRejectedValue(new Error("Stripe unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.applySubscriptionEventFromStripe).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
