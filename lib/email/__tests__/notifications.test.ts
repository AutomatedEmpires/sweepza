import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  insertLog: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ from: mocks.from }),
}));

import { sendHostNotification } from "@/lib/email/notifications";

function lookup(data: unknown) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data }),
      }),
    }),
  };
}

describe("email notification delivery logging", () => {
  beforeEach(() => {
    mocks.sendEmail.mockReset();
    mocks.insertLog.mockReset();
    mocks.insertLog.mockResolvedValue({ error: null });
    mocks.from.mockReset();
    mocks.from.mockImplementation((table: string) => {
      if (table === "host") return lookup({ app_user_id: "user-1" });
      if (table === "app_user") return lookup({ email: "recipient@example.com" });
      if (table === "notification_pref") return lookup({ email_enabled: true });
      if (table === "notification_log") return { insert: mocks.insertLog };
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("records a disabled send as skipped with no sent timestamp", async () => {
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
