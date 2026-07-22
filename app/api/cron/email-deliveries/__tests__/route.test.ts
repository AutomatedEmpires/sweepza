import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: false,
  configured: true,
  schemaReady: false,
  client: { name: "service-client" },
  createServiceRoleClient: vi.fn(),
  processDueEmailDeliveries: vi.fn(),
  purgeExpiredEmailDeliveries: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
}));
vi.mock("@/lib/email/outbound-gate", () => ({
  isEmailOutboxSchemaReady: () => mocks.schemaReady,
  isOutboundEmailEnabled: () => mocks.enabled,
  isOutboundEmailConfigured: () => mocks.configured,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/email/delivery-worker", () => ({
  processDueEmailDeliveries: mocks.processDueEmailDeliveries,
}));
vi.mock("@/lib/email/delivery-outbox", () => ({
  purgeExpiredEmailDeliveries: mocks.purgeExpiredEmailDeliveries,
}));

import { GET } from "@/app/api/cron/email-deliveries/route";

function request(authorization?: string): Request {
  return new Request("https://sweepza.com/api/cron/email-deliveries", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("email delivery retry cron", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    mocks.enabled = false;
    mocks.configured = true;
    mocks.schemaReady = false;
    mocks.createServiceRoleClient.mockReset();
    mocks.createServiceRoleClient.mockReturnValue(mocks.client);
    mocks.processDueEmailDeliveries.mockReset();
    mocks.purgeExpiredEmailDeliveries.mockReset();
    mocks.purgeExpiredEmailDeliveries.mockResolvedValue({
      suppressed: 0,
      payloadExpired: 0,
      providerWindowExpired: 0,
      notificationLogsUpdated: 0,
    });
    mocks.captureMessage.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates before revealing delivery state", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("is a database-free no-op while outbound email is disabled", async () => {
    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      enabled: false,
      reason: "outbound_email_disabled",
      claimed: 0,
      sent: 0,
    });
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("purges safely but never sends when transport configuration is incomplete", async () => {
    mocks.enabled = true;
    mocks.configured = false;
    mocks.schemaReady = true;

    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(503);
    expect(mocks.purgeExpiredEmailDeliveries).toHaveBeenCalledWith(mocks.client, 50);
  });

  it("purges expired payloads while transport remains disabled", async () => {
    mocks.schemaReady = true;
    mocks.purgeExpiredEmailDeliveries.mockResolvedValue({
      suppressed: 2,
      payloadExpired: 1,
      providerWindowExpired: 1,
      notificationLogsUpdated: 3,
    });

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: false,
      schemaReady: true,
      expiredSuppressed: 2,
      payloadExpired: 1,
      providerWindowExpired: 1,
    });
    expect(mocks.purgeExpiredEmailDeliveries).toHaveBeenCalledWith(mocks.client, 50);
    expect(mocks.processDueEmailDeliveries).not.toHaveBeenCalled();
  });

  it("processes due leases and reports retry outcomes", async () => {
    mocks.enabled = true;
    mocks.schemaReady = true;
    mocks.processDueEmailDeliveries.mockResolvedValue({
      expiredSuppressed: 2,
      payloadExpired: 1,
      providerWindowExpired: 1,
      claimed: 3,
      sent: 1,
      deferred: 0,
      skipped: 1,
      failed: 1,
      retryScheduled: 1,
      recoveryPending: 0,
      failureDetails: [
        {
          deliveryId: "11111111-1111-4111-8111-111111111111",
          code: "transport_rate_limit_exceeded",
          retryScheduled: true,
          recoveryPending: false,
        },
      ],
    });

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      enabled: true,
      configured: true,
      schemaReady: true,
      expiredSuppressed: 2,
      payloadExpired: 1,
      providerWindowExpired: 1,
      claimed: 3,
      sent: 1,
      deferred: 0,
      skipped: 1,
      failed: 1,
      retryScheduled: 1,
      recoveryPending: 0,
    });
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tags: {
          error_code: "transport_rate_limit_exceeded",
          retry_scheduled: "true",
          recovery_pending: "false",
        },
      }),
    );
    expect(JSON.stringify(body)).not.toContain("deliveryId");
    expect(mocks.processDueEmailDeliveries).toHaveBeenCalledWith(mocks.client);
  });

  it("returns a failure without leaking database details", async () => {
    mocks.enabled = true;
    mocks.schemaReady = true;
    mocks.processDueEmailDeliveries.mockRejectedValue(
      new Error("sensitive database error"),
    );

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toContain("sensitive database error");
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain(
      "sensitive database error",
    );
  });
});
