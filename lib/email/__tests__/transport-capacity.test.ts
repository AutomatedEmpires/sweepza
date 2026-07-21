import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeTransactionalEmailTransport,
  EmailTransportCapacityError,
} from "@/lib/email/transport-capacity";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION_ARGS = {
  appUserId: USER_ID,
  hostId: null,
  preferenceKey: "winner_wall_verification" as const,
};

describe("shared email transport authorization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the recipient reserved by the database transaction", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        authorized: true,
        reserved: true,
        app_user_id: USER_ID,
        recipient: "winner@example.com",
      },
      error: null,
    });

    await expect(
      authorizeTransactionalEmailTransport({ rpc } as never, AUTHORIZATION_ARGS),
    ).resolves.toEqual({
      authorized: true,
      appUserId: USER_ID,
      recipient: "winner@example.com",
    });
    expect(rpc).toHaveBeenCalledWith(
      "authorize_transactional_email_transport",
      {
        p_app_user_id: USER_ID,
        p_host_id: null,
        p_preference_key: "winner_wall_verification",
      },
    );
  });

  it("re-authorizes after waiting for a full rolling window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T20:00:00.000Z"));
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          authorized: true,
          reserved: false,
          app_user_id: USER_ID,
          next_attempt_at: "2026-07-21T20:00:00.100Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          authorized: false,
          reserved: false,
          app_user_id: USER_ID,
          reason: "notification_preference_changed",
        },
        error: null,
      });

    const authorization = authorizeTransactionalEmailTransport(
      { rpc } as never,
      AUTHORIZATION_ARGS,
    );
    await vi.advanceTimersByTimeAsync(100);
    await expect(authorization).resolves.toEqual({
      authorized: false,
      appUserId: USER_ID,
      reason: "notification_preference_changed",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed on an invalid database response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });

    await expect(
      authorizeTransactionalEmailTransport({ rpc } as never, AUTHORIZATION_ARGS),
    ).rejects.toBeInstanceOf(EmailTransportCapacityError);
  });
});
