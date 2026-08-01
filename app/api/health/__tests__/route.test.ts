import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentsEnabled: false,
  outboundEmailConfigured: true,
  outboundEmailEnabled: false,
  getIngestionReadiness: vi.fn(),
  env: {
    NEXT_PUBLIC_APP_URL: "https://sweepza.com",
    STRIPE_SECRET_KEY: "sk_configured",
    STRIPE_ACCOUNT_ID: "acct_configured",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_configured",
    STRIPE_WEBHOOK_SECRET: "configured-webhook-secret",
    STRIPE_PRICE_HOST_BASELINE: "price_configured",
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/billing/payment-gate", () => ({
  isPaymentsEnabled: () => mocks.paymentsEnabled,
}));
vi.mock("@/lib/email/outbound-gate", () => ({
  isOutboundEmailConfigured: () => mocks.outboundEmailConfigured,
  isOutboundEmailEnabled: () => mocks.outboundEmailEnabled,
}));
vi.mock("@/lib/db/source-health", () => ({
  getIngestionReadiness: mocks.getIngestionReadiness,
}));

import { GET } from "@/app/api/health/route";

describe("health payment status", () => {
  beforeEach(() => {
    mocks.paymentsEnabled = false;
    mocks.outboundEmailConfigured = true;
    mocks.outboundEmailEnabled = false;
    mocks.getIngestionReadiness.mockReset();
    mocks.getIngestionReadiness.mockResolvedValue({
      enabled: false,
      configured: true,
      ready: false,
      operationalDataReadable: true,
      officialSourceReady: false,
      directOfficialIntakeReady: false,
      eligibleDiscoverySources: 0,
      blockers: ["disabled"],
    });
  });

  it("reports configured email separately from disabled delivery", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.integrations.email).toEqual({
      configured: true,
      enabled: false,
      ready: false,
    });
    expect(body.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it("fails health when email is enabled without complete configuration", async () => {
    mocks.outboundEmailEnabled = true;
    mocks.outboundEmailConfigured = false;

    const response = await GET();
    const body = await response.json();

    expect(body.integrations.email).toEqual({
      configured: false,
      enabled: true,
      ready: false,
    });
    expect(body.ok).toBe(false);
    expect(response.status).toBe(503);
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

  it("reports intentionally disabled ingestion without failing app health", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.integrations.ingestion).toEqual({
      enabled: false,
      configured: true,
      ready: false,
      operationalDataReadable: true,
      officialSourceReady: false,
      directOfficialIntakeReady: false,
      eligibleDiscoverySources: 0,
      blockers: ["disabled"],
    });
    expect(body.ok).toBe(true);
  });

  it("fails health closed when enabled ingestion is not operationally ready", async () => {
    mocks.getIngestionReadiness.mockResolvedValue({
      enabled: true,
      configured: true,
      ready: false,
      operationalDataReadable: false,
      officialSourceReady: false,
      directOfficialIntakeReady: false,
      eligibleDiscoverySources: 0,
      blockers: [
        "operational_data_unreadable",
        "official_source_not_ready",
      ],
    });

    const response = await GET();
    const body = await response.json();

    expect(body.integrations.ingestion.enabled).toBe(true);
    expect(body.integrations.ingestion.ready).toBe(false);
    expect(body.ok).toBe(false);
    expect(response.status).toBe(503);
  });

  it("returns 503 when enabled ingestion has zero executable official destinations", async () => {
    mocks.getIngestionReadiness.mockResolvedValue({
      enabled: true,
      configured: true,
      ready: false,
      operationalDataReadable: true,
      officialSourceReady: false,
      directOfficialIntakeReady: false,
      eligibleDiscoverySources: 2,
      blockers: ["official_source_not_ready"],
    });

    const response = await GET();
    const body = await response.json();

    expect(body.integrations.ingestion).toMatchObject({
      enabled: true,
      ready: false,
      operationalDataReadable: true,
      officialSourceReady: false,
      blockers: ["official_source_not_ready"],
    });
    expect(body.ok).toBe(false);
    expect(response.status).toBe(503);
  });

  it("keeps health green when enabled ingestion is fully ready", async () => {
    mocks.getIngestionReadiness.mockResolvedValue({
      enabled: true,
      configured: true,
      ready: true,
      operationalDataReadable: true,
      officialSourceReady: true,
      directOfficialIntakeReady: true,
      eligibleDiscoverySources: 2,
      blockers: [],
    });

    const response = await GET();
    const body = await response.json();

    expect(body.integrations.ingestion.ready).toBe(true);
    expect(body.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it.each([
    "STRIPE_SECRET_KEY",
    "STRIPE_ACCOUNT_ID",
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
