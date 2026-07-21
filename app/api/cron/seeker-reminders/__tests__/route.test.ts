import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "22222222-2222-4222-8222-222222222222";
const DAY_MS = 86_400_000;

const mocks = vi.hoisted(() => ({
  enabled: false,
  configured: true,
  schemaReady: true,
  createServiceRoleClient: vi.fn(),
  claimReminderScanBatch: vi.fn(),
  completeReminderScan: vi.fn(),
  findClaimedReminderEmailKeys: vi.fn(),
  claimReminderEmailDelivery: vi.fn(),
  deliverClaimedEmail: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureMessage: mocks.captureMessage }));
vi.mock("@/lib/email/outbound-gate", () => ({
  isOutboundEmailEnabled: () => mocks.enabled,
  isOutboundEmailConfigured: () => mocks.configured,
  isEmailOutboxSchemaReady: () => mocks.schemaReady,
  requireOutboundEmailConfiguration: () => ({
    apiKey: "not-returned-to-database",
    from: "Sweepza <reminders@send.sweepza.com>",
    replyTo: "support@sweepza.com",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/email/reminder-scan", () => ({
  claimReminderScanBatch: mocks.claimReminderScanBatch,
  completeReminderScan: mocks.completeReminderScan,
  findClaimedReminderEmailKeys: mocks.findClaimedReminderEmailKeys,
}));
vi.mock("@/lib/email/delivery-outbox", () => ({
  claimReminderEmailDelivery: mocks.claimReminderEmailDelivery,
  deliverClaimedEmail: mocks.deliverClaimedEmail,
}));

import { GET } from "@/app/api/cron/seeker-reminders/route";

function request(authorization?: string): Request {
  return new Request("https://sweepza.com/api/cron/seeker-reminders", {
    headers: authorization ? { authorization } : undefined,
  });
}

function scanUser(endDate: string) {
  return {
    appUserId: USER_ID,
    scanToken: "33333333-3333-4333-8333-333333333333",
    email: "seeker@example.com",
    displayName: "Seeker",
    emailEnabled: true,
    prefs: { readyAgain: true, endsToday: true, endsSoon: true },
    hasMoreCandidates: false,
    nextCursorEndDate: null,
    nextCursorListingId: null,
    candidates: [
      {
        activity: {
          savedAt: new Date().toISOString(),
          enteredAt: null,
          skippedAt: null,
          wonAt: null,
        },
        listing: {
          id: LISTING_ID,
          slug: "verified-prize",
          title: "Verified prize",
          endDate,
          entryFrequency: "daily" as const,
        },
      },
    ],
  };
}

describe("seeker reminder delivery", () => {
  let endDate: string;

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    endDate = new Date(Date.now() + 2 * DAY_MS).toISOString();
    mocks.enabled = false;
    mocks.configured = true;
    mocks.schemaReady = true;
    mocks.createServiceRoleClient.mockReset();
    mocks.claimReminderScanBatch.mockReset();
    mocks.completeReminderScan.mockReset();
    mocks.findClaimedReminderEmailKeys.mockReset();
    mocks.claimReminderEmailDelivery.mockReset();
    mocks.deliverClaimedEmail.mockReset();
    mocks.captureMessage.mockReset();
    mocks.claimReminderScanBatch.mockResolvedValue([]);
    mocks.completeReminderScan.mockResolvedValue(undefined);
    mocks.findClaimedReminderEmailKeys.mockResolvedValue(new Set());
    mocks.createServiceRoleClient.mockReturnValue({ rpc: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates before revealing the disabled state", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns a successful no-op before database access when disabled", async () => {
    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: false,
      configured: true,
      schemaReady: true,
      reason: "outbound_email_disabled",
      candidates: 0,
      emailed: 0,
      deferred: 0,
      reminders: 0,
      failed: 0,
    });
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails before database access when enabled but incomplete", async () => {
    mocks.enabled = true;
    mocks.configured = false;

    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(503);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails before database access when the outbox schema is not activated", async () => {
    mocks.enabled = true;
    mocks.schemaReady = false;

    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(503);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails closed when the bounded scan claim is unavailable", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockRejectedValue(new Error("private detail"));

    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(500);
    expect(mocks.claimReminderEmailDelivery).not.toHaveBeenCalled();
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ tags: { scope: "scan_claim", error_code: "scan_claim_failed" } }),
    );
  });

  it("checks only the exact bounded set of planned email keys", async () => {
    mocks.enabled = true;
    const user = scanUser(endDate);
    mocks.claimReminderScanBatch.mockResolvedValue([user]);
    const reminderDay = new Date(endDate).toISOString().slice(0, 10);
    const key = `ending_soon|${LISTING_ID}|${reminderDay}`;
    mocks.findClaimedReminderEmailKeys.mockResolvedValue(new Set([key]));

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ emailed: 0, skipped: 1, failed: 0 });
    expect(mocks.findClaimedReminderEmailKeys).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      [key],
    );
    expect(mocks.claimReminderEmailDelivery).not.toHaveBeenCalled();
  });

  it("plans the listing end date as ends_today on the shared UTC calendar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T20:00:00.000Z"));
    try {
      mocks.enabled = true;
      mocks.claimReminderScanBatch.mockResolvedValue([scanUser("2026-07-21")]);
      mocks.claimReminderEmailDelivery.mockResolvedValue({
        claimed: false,
        reason: "already_claimed",
      });

      const response = await GET(request("Bearer cron-secret-for-tests"));

      expect(response.status).toBe(200);
      expect(mocks.findClaimedReminderEmailKeys).toHaveBeenCalledWith(
        expect.anything(),
        USER_ID,
        [`ends_today|${LISTING_ID}|2026-07-21`],
      );
      expect(mocks.claimReminderEmailDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          events: [
            expect.objectContaining({
              type: "ends_today",
              dedupeKey: `ends_today|${LISTING_ID}|2026-07-21`,
            }),
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed when exact delivery history cannot be verified", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
    mocks.findClaimedReminderEmailKeys.mockRejectedValue(
      new Error("private detail"),
    );

    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(500);
    expect(mocks.claimReminderEmailDelivery).not.toHaveBeenCalled();
    expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
  });

  it("claims a bounded scan and freezes current listing fields before transport", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
    const claimedDelivery = { deliveryId: "delivery-1" };
    mocks.claimReminderEmailDelivery.mockResolvedValue({
      claimed: true,
      delivery: claimedDelivery,
    });
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "sent",
      providerMessageId: "email-1",
    });

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, emailed: 1, reminders: 1, failed: 0 });
    expect(mocks.claimReminderScanBatch).toHaveBeenCalledWith(expect.anything(), 10);
    expect(mocks.claimReminderEmailDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        appUserId: USER_ID,
        recipient: "seeker@example.com",
        sender: "Sweepza <reminders@send.sweepza.com>",
        replyTo: "support@sweepza.com",
        events: [
          expect.objectContaining({
            type: "ending_soon",
            dedupeKey: expect.stringContaining(LISTING_ID),
            metadata: expect.objectContaining({
              listingId: LISTING_ID,
              slug: "verified-prize",
              title: "Verified prize",
              endDate,
              entryFrequency: "daily",
            }),
          }),
        ],
      }),
    );
    expect(mocks.deliverClaimedEmail).toHaveBeenCalledWith(
      expect.anything(),
      claimedDelivery,
    );
    expect(mocks.completeReminderScan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appUserId: USER_ID }),
      { success: true, deferForDay: true },
    );
  });

  it.each([
    "already_claimed",
    "preference_disabled",
    "recipient_changed",
    "reminder_no_longer_current",
  ])(
    "treats the expected %s claim race as a quiet skip",
    async (reason) => {
      mocks.enabled = true;
      mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
      mocks.claimReminderEmailDelivery.mockResolvedValue({ claimed: false, reason });

      const response = await GET(request("Bearer cron-secret-for-tests"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ok: true, emailed: 0, skipped: 1, failed: 0 });
      expect(mocks.deliverClaimedEmail).not.toHaveBeenCalled();
      expect(mocks.completeReminderScan).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { success: true, deferForDay: true },
      );
      expect(mocks.captureMessage).not.toHaveBeenCalled();
    },
  );

  it("acknowledges a shared provider-window deferral for durable retry", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
    mocks.claimReminderEmailDelivery.mockResolvedValue({
      claimed: true,
      delivery: { deliveryId: "delivery-1" },
    });
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "deferred",
      reason: "provider_rate_window_full",
    });

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      emailed: 0,
      deferred: 1,
      failed: 0,
      retryScheduled: 1,
    });
    expect(mocks.completeReminderScan).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { success: true, deferForDay: true },
    );
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it("reports provider failure with sanitized telemetry and a retryable status", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
    mocks.claimReminderEmailDelivery.mockResolvedValue({
      claimed: true,
      delivery: { deliveryId: "delivery-1" },
    });
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "failed",
      retryScheduled: true,
      nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      error: new Error("recipient seeker@example.com and provider body"),
    });

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ ok: false, failed: 1, retryScheduled: 1 });
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tags: { scope: "transport", error_code: "delivery_operation_failed" },
      }),
    );
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain(
      "seeker@example.com",
    );
  });

  it("uses a provider-safe deadline during the first UTC hour", async () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2026-07-21T00:15:00.000Z");
      vi.setSystemTime(now);
      mocks.enabled = true;
      mocks.claimReminderScanBatch.mockResolvedValue([
        scanUser("2026-07-23T00:00:00.000Z"),
      ]);
      mocks.claimReminderEmailDelivery.mockResolvedValue({
        claimed: true,
        delivery: { deliveryId: "delivery-1" },
      });
      mocks.deliverClaimedEmail.mockResolvedValue({
        status: "sent",
        providerMessageId: "email-1",
      });

      const response = await GET(request("Bearer cron-secret-for-tests"));

      expect(response.status).toBe(200);
      const args = mocks.claimReminderEmailDelivery.mock.calls[0]?.[1];
      expect(new Date(args.sendBefore).getTime() - now.getTime()).toBe(
        22 * 60 * 60 * 1_000,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("requeues the scan lease when pre-delivery work fails", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
    mocks.findClaimedReminderEmailKeys.mockRejectedValue(new Error("private"));

    const response = await GET(request("Bearer cron-secret-for-tests"));

    expect(response.status).toBe(500);
    expect(mocks.completeReminderScan).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { success: false, deferForDay: false },
    );
  });

  it("reports durable lease recovery when persistence fails after the outbox claim", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
    mocks.claimReminderEmailDelivery.mockResolvedValue({
      claimed: true,
      delivery: { deliveryId: "delivery-1" },
    });
    mocks.deliverClaimedEmail.mockRejectedValue(new Error("private persistence detail"));

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      failed: 1,
      retryScheduled: 0,
      recoveryPending: 1,
    });
    expect(mocks.completeReminderScan).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { success: true, deferForDay: true },
    );
    expect(JSON.stringify(body)).not.toContain("private persistence detail");
  });

  it("reports an acknowledgement failure without losing the sent count", async () => {
    mocks.enabled = true;
    mocks.claimReminderScanBatch.mockResolvedValue([scanUser(endDate)]);
    mocks.claimReminderEmailDelivery.mockResolvedValue({
      claimed: true,
      delivery: { deliveryId: "delivery-1" },
    });
    mocks.deliverClaimedEmail.mockResolvedValue({
      status: "sent",
      providerMessageId: "email-1",
    });
    mocks.completeReminderScan.mockRejectedValue(new Error("private"));

    const response = await GET(request("Bearer cron-secret-for-tests"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ emailed: 1, reminders: 1, failed: 1 });
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tags: {
          scope: "scan_completion",
          error_code: "scan_completion_failed",
        },
      }),
    );
  });
});
