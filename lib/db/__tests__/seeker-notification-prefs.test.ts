import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SEEKER_NOTIFICATION_PREFS } from "@/lib/seeker-notification-prefs-schema";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  }),
}));

import { getSeekerNotificationPrefs } from "@/lib/db/seeker-notification-prefs";

describe("getSeekerNotificationPrefs", () => {
  beforeEach(() => {
    mocks.maybeSingle.mockReset();
  });

  it("requires explicit master email consent when the preference row is missing", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      getSeekerNotificationPrefs("11111111-1111-4111-8111-111111111111"),
    ).resolves.toEqual({
      email_enabled: false,
      ready_again: true,
      ends_today: true,
      ends_soon: true,
    });
    expect(DEFAULT_SEEKER_NOTIFICATION_PREFS.email_enabled).toBe(false);
  });

  it("returns an existing preference row unchanged", async () => {
    const stored = {
      email_enabled: true,
      ready_again: false,
      ends_today: true,
      ends_soon: false,
    };
    mocks.maybeSingle.mockResolvedValue({ data: stored, error: null });

    await expect(
      getSeekerNotificationPrefs("11111111-1111-4111-8111-111111111111"),
    ).resolves.toEqual(stored);
  });

  it("does not silently replace a failed preference read with defaults", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "read unavailable" },
    });

    await expect(
      getSeekerNotificationPrefs("11111111-1111-4111-8111-111111111111"),
    ).rejects.toThrow("getSeekerNotificationPrefs failed");
  });
});
