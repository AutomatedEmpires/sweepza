import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return { ...actual, sendEmail: mocks.sendEmail };
});

import {
  claimDueEmailDeliveries,
  claimReminderEmailDelivery,
  deliverClaimedEmail,
  EmailDeliveryPersistenceError,
  purgeExpiredEmailDeliveries,
  type ClaimedEmailDelivery,
} from "@/lib/email/delivery-outbox";
import { EmailSendError } from "@/lib/email/send";

const DELIVERY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_TOKEN = "33333333-3333-4333-8333-333333333333";

const rawDelivery = {
  delivery_id: DELIVERY_ID,
  app_user_id: USER_ID,
  notification_type: "seeker_reminder_digest",
  idempotency_key: `sweepza/reminder/${DELIVERY_ID}`,
  recipient: "seeker@example.com",
  sender: "Sweepza <reminders@send.sweepza.com>",
  reply_to: "support@sweepza.com",
  subject: "Your reminders",
  html: "<p>Reminder</p>",
  metadata: { events: [] },
  lease_token: LEASE_TOKEN,
  attempt_count: 1,
  send_before: "2026-07-22T00:00:00.000Z",
};

const delivery: ClaimedEmailDelivery = {
  deliveryId: DELIVERY_ID,
  appUserId: USER_ID,
  notificationType: "seeker_reminder_digest",
  idempotencyKey: `sweepza/reminder/${DELIVERY_ID}`,
  recipient: "seeker@example.com",
  sender: "Sweepza <reminders@send.sweepza.com>",
  replyTo: "support@sweepza.com",
  subject: "Your reminders",
  html: "<p>Reminder</p>",
  metadata: { events: [] },
  leaseToken: LEASE_TOKEN,
  attemptCount: 1,
  sendBefore: "2026-07-22T00:00:00.000Z",
};

const supabase = { rpc: mocks.rpc } as never;

describe("durable email delivery outbox", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.sendEmail.mockReset();
  });

  it("maps visible bounded expiry-purge counts", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        suppressed: 3,
        payload_expired: 2,
        provider_window_expired: 1,
        notification_logs_updated: 4,
      },
      error: null,
    });

    await expect(purgeExpiredEmailDeliveries(supabase, 50)).resolves.toEqual({
      suppressed: 3,
      payloadExpired: 2,
      providerWindowExpired: 1,
      notificationLogsUpdated: 4,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("purge_expired_email_deliveries", {
      p_limit: 50,
    });
  });

  it("maps a reminder digest to one atomic claim RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: { claimed: true, delivery: rawDelivery },
      error: null,
    });

    const result = await claimReminderEmailDelivery(supabase, {
      appUserId: USER_ID,
      recipient: "seeker@example.com",
      sender: "Sweepza <reminders@send.sweepza.com>",
      replyTo: "support@sweepza.com",
      subject: "Your reminders",
      html: "<p>Reminder</p>",
      sendBefore: "2026-07-22T00:00:00.000Z",
      events: [
        {
          type: "ends_today",
          dedupeKey: "ends_today|listing-1|2026-07-21",
          metadata: { listingId: "listing-1", reminderKey: "2026-07-21" },
        },
      ],
    });

    expect(result).toEqual({ claimed: true, delivery });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_reminder_email_delivery", {
      p_app_user_id: USER_ID,
      p_recipient: "seeker@example.com",
      p_sender: "Sweepza <reminders@send.sweepza.com>",
      p_reply_to: "support@sweepza.com",
      p_subject: "Your reminders",
      p_html: "<p>Reminder</p>",
      p_send_before: "2026-07-22T00:00:00.000Z",
      p_events: [
        {
          type: "ends_today",
          dedupe_key: "ends_today|listing-1|2026-07-21",
          metadata: { listingId: "listing-1", reminderKey: "2026-07-21" },
        },
      ],
    });
  });

  it("treats an overlapping atomic claim as a safe no-op", async () => {
    mocks.rpc.mockResolvedValue({
      data: { claimed: false, reason: "already_claimed" },
      error: null,
    });

    await expect(
      claimReminderEmailDelivery(supabase, {
        appUserId: USER_ID,
        recipient: "seeker@example.com",
        sender: "Sweepza <reminders@send.sweepza.com>",
        replyTo: "support@sweepza.com",
        subject: "Your reminders",
        html: "<p>Reminder</p>",
        sendBefore: "2026-07-22T00:00:00.000Z",
        events: [
          {
            type: "ends_today",
            dedupeKey: "ends_today|listing-1|2026-07-21",
            metadata: {},
          },
        ],
      }),
    ).resolves.toEqual({ claimed: false, reason: "already_claimed" });
  });

  it("fails closed on malformed due-delivery data", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ delivery_id: "not-a-uuid" }], error: null });

    await expect(claimDueEmailDeliveries(supabase)).rejects.toMatchObject({
      name: "EmailDeliveryPersistenceError",
      operation: "retry claim",
    });
  });

  it("sends the frozen request and completes its lease after provider confirmation", async () => {
    mocks.sendEmail.mockResolvedValue({ status: "sent", id: "email_123" });
    mocks.rpc
      .mockResolvedValueOnce({
        data: { authorized: true, suppressed: false },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(deliverClaimedEmail(supabase, delivery)).resolves.toEqual({
      status: "sent",
      providerMessageId: "email_123",
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: delivery.recipient,
      from: delivery.sender,
      replyTo: delivery.replyTo,
      subject: delivery.subject,
      html: delivery.html,
      idempotencyKey: delivery.idempotencyKey,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "authorize_email_delivery_transport",
      {
        p_delivery_id: DELIVERY_ID,
        p_lease_token: LEASE_TOKEN,
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_email_delivery", {
      p_delivery_id: DELIVERY_ID,
      p_lease_token: LEASE_TOKEN,
      p_provider_message_id: "email_123",
    });
  });

  it("records a retryable provider failure without persisting provider text", async () => {
    mocks.sendEmail.mockRejectedValue(
      new EmailSendError("sensitive provider response", {
        kind: "provider_http",
        retryable: true,
        status: 503,
        providerCode: "service_unavailable",
      }),
    );
    mocks.rpc
      .mockResolvedValueOnce({
        data: { authorized: true, suppressed: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          recorded: true,
          retry_scheduled: true,
          next_attempt_at: "2026-07-21T16:30:00.000Z",
        },
        error: null,
      });

    const result = await deliverClaimedEmail(supabase, delivery);

    expect(result).toMatchObject({
      status: "failed",
      retryScheduled: true,
      nextAttemptAt: "2026-07-21T16:30:00.000Z",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("fail_email_delivery", {
      p_delivery_id: DELIVERY_ID,
      p_lease_token: LEASE_TOKEN,
      p_error_code: "service_unavailable",
      p_retryable: true,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(
      "sensitive provider response",
    );
  });

  it("leaves a provider-confirmed row recoverable when completion persistence fails", async () => {
    mocks.sendEmail.mockResolvedValue({ status: "sent", id: "email_123" });
    mocks.rpc
      .mockResolvedValueOnce({
        data: { authorized: true, suppressed: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "database unavailable" },
      });

    await expect(deliverClaimedEmail(supabase, delivery)).rejects.toBeInstanceOf(
      EmailDeliveryPersistenceError,
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("complete_email_delivery", expect.anything());
  });

  it("suppresses a leased request if the activation gate closes before transport", async () => {
    mocks.sendEmail.mockResolvedValue({
      status: "skipped",
      reason: "outbound_email_disabled",
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: { authorized: true, suppressed: false },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(deliverClaimedEmail(supabase, delivery)).resolves.toEqual({
      status: "skipped",
      reason: "outbound_email_disabled",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("suppress_email_delivery", {
      p_delivery_id: DELIVERY_ID,
      p_lease_token: LEASE_TOKEN,
      p_reason: "outbound_email_disabled",
    });
  });

  it.each([
    "recipient_unavailable",
    "recipient_changed",
    "notification_preference_changed",
    "reminder_no_longer_current",
    "invalid_delivery_metadata",
    "unsupported_delivery_type",
    "reminder_payload_expired",
    "provider_idempotency_window_expired",
  ] as const)(
    "skips transport after database-time suppression: %s",
    async (reason) => {
      mocks.rpc.mockResolvedValue({
        data: { authorized: false, suppressed: true, reason },
        error: null,
      });

      await expect(deliverClaimedEmail(supabase, delivery)).resolves.toEqual({
        status: "skipped",
        reason,
      });
      expect(mocks.sendEmail).not.toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.rpc).toHaveBeenCalledWith(
        "authorize_email_delivery_transport",
        {
          p_delivery_id: DELIVERY_ID,
          p_lease_token: LEASE_TOKEN,
        },
      );
    },
  );

  it("defers without transport when the shared provider window is full", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        authorized: false,
        suppressed: false,
        deferred: true,
        reason: "provider_rate_window_full",
      },
      error: null,
    });

    await expect(deliverClaimedEmail(supabase, delivery)).resolves.toEqual({
      status: "deferred",
      reason: "provider_rate_window_full",
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "authorize_email_delivery_transport",
      {
        p_delivery_id: DELIVERY_ID,
        p_lease_token: LEASE_TOKEN,
      },
    );
  });

  it("fails closed before transport when the lease CAS is no longer authorized", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        authorized: false,
        suppressed: false,
        reason: "lease_window_closing",
      },
      error: null,
    });

    await expect(deliverClaimedEmail(supabase, delivery)).rejects.toMatchObject({
      name: "EmailDeliveryPersistenceError",
      operation: "transport authorization",
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
