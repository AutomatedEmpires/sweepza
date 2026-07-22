import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outboundEnabled: true,
  schemaReady: true,
  sendEmail: vi.fn(),
  insertLog: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  host: { app_user_id: "11111111-1111-4111-8111-111111111111" } as {
    app_user_id: string;
  } | null,
  appUser: { email: "recipient@example.com" } as { email: string } | null,
  pref: { email_enabled: true } as Record<string, unknown> | null,
  hostError: null as { message: string } | null,
  appUserError: null as { message: string } | null,
  prefError: null as { message: string } | null,
}));

vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/email/outbound-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/outbound-gate")>()),
  isOutboundEmailEnabled: () => mocks.outboundEnabled,
  isEmailOutboxSchemaReady: () => mocks.schemaReady,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import {
  sendHostNotification,
  sendWinnerNotification,
} from "@/lib/email/notifications";

function lookup(data: unknown, error: unknown = null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data, error }),
      }),
    }),
  };
}

describe("email notification delivery logging", () => {
  beforeEach(() => {
    mocks.outboundEnabled = true;
    mocks.schemaReady = true;
    mocks.sendEmail.mockReset();
    mocks.insertLog.mockReset();
    mocks.insertLog.mockResolvedValue({ error: null });
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: {
        authorized: true,
        reserved: true,
        app_user_id: "11111111-1111-4111-8111-111111111111",
        recipient: "recipient@example.com",
      },
      error: null,
    });
    mocks.host = {
      app_user_id: "11111111-1111-4111-8111-111111111111",
    };
    mocks.appUser = { email: "recipient@example.com" };
    mocks.pref = { email_enabled: true };
    mocks.hostError = null;
    mocks.appUserError = null;
    mocks.prefError = null;
    mocks.from.mockImplementation((table: string) => {
      if (table === "host") return lookup(mocks.host, mocks.hostError);
      if (table === "app_user") {
        return lookup(mocks.appUser, mocks.appUserError);
      }
      if (table === "notification_pref") {
        return lookup(mocks.pref, mocks.prefError);
      }
      if (table === "notification_log") return { insert: mocks.insertLog };
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("records a disabled send as skipped with no sent timestamp", async () => {
    mocks.outboundEnabled = false;
    mocks.sendEmail.mockResolvedValue({
      status: "skipped",
      reason: "outbound_email_disabled",
    });

    await sendHostNotification({
      hostId: "host-1",
      type: "listing_approved",
      payload: { listingTitle: "A sweep" },
    });

    expect(mocks.insertLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        sent_at: null,
        metadata: {
          listingTitle: "A sweep",
          delivery_reason: "outbound_email_disabled",
        },
      }),
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("records sent only after the transport reports sent", async () => {
    mocks.sendEmail.mockResolvedValue({ status: "sent" });

    await sendHostNotification({
      hostId: "host-1",
      type: "listing_approved",
      payload: { listingTitle: "A sweep" },
    });

    expect(mocks.insertLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        sent_at: expect.any(String),
        metadata: { listingTitle: "A sweep" },
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "authorize_transactional_email_transport",
      {
        p_app_user_id: "11111111-1111-4111-8111-111111111111",
        p_host_id: "host-1",
        p_preference_key: "email_on_listing_approved",
      },
    );
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendEmail.mock.invocationCallOrder[0],
    );
  });

  it("fails closed before transport when the shared window schema is unavailable", async () => {
    mocks.schemaReady = false;

    await expect(
      sendHostNotification({
        hostId: "host-1",
        type: "listing_approved",
        payload: { listingTitle: "A sweep" },
      }),
    ).rejects.toThrow("capacity could not be reserved safely");

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("atomically suppresses consent revoked before capacity is reserved", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        authorized: false,
        reserved: false,
        app_user_id: "11111111-1111-4111-8111-111111111111",
        reason: "notification_preference_changed",
      },
      error: null,
    });

    await sendHostNotification({
      hostId: "host-1",
      type: "listing_approved",
      payload: { listingTitle: "A sweep" },
    });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        metadata: expect.objectContaining({
          delivery_reason: "notification_preference_changed",
        }),
      }),
    );
  });

  it("uses the recipient atomically returned with the shared reservation", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        authorized: true,
        reserved: true,
        app_user_id: "11111111-1111-4111-8111-111111111111",
        recipient: "updated@example.com",
      },
      error: null,
    });
    mocks.sendEmail.mockResolvedValue({ status: "sent", id: "email-1" });

    await sendHostNotification({
      hostId: "host-1",
      type: "listing_approved",
      payload: { listingTitle: "A sweep" },
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "updated@example.com" }),
    );
  });

  it("atomically rechecks winner-notification consent with capacity", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        authorized: false,
        reserved: false,
        app_user_id: "11111111-1111-4111-8111-111111111111",
        reason: "notification_preference_changed",
      },
      error: null,
    });

    await sendWinnerNotification({
      appUserId: "11111111-1111-4111-8111-111111111111",
      payload: { listingTitle: "A sweep" },
    });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "winner_post_published",
        status: "skipped",
        metadata: expect.objectContaining({
          delivery_reason: "notification_preference_changed",
        }),
      }),
    );
  });

  it("fails closed when disabled-path preference state cannot be read", async () => {
    mocks.outboundEnabled = false;
    mocks.prefError = { message: "private database detail" };

    await expect(
      sendWinnerNotification({
        appUserId: "11111111-1111-4111-8111-111111111111",
        payload: { listingTitle: "A sweep" },
      }),
    ).rejects.toThrow("state could not be verified");

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("records a sanitized failure and rethrows transport errors", async () => {
    mocks.sendEmail.mockRejectedValue(
      new Error("provider response that must not be persisted"),
    );

    await expect(
      sendHostNotification({
        hostId: "host-1",
        type: "listing_approved",
        payload: { listingTitle: "A sweep" },
      }),
    ).rejects.toThrow("provider response that must not be persisted");

    expect(mocks.insertLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        sent_at: null,
        metadata: {
          listingTitle: "A sweep",
          delivery_reason: "outbound_email_delivery_failed",
        },
      }),
    );
  });
});
