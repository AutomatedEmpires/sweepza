import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkConfigured: true,
  authUser: {
    appUserId: "11111111-1111-4111-8111-111111111111",
  } as { appUserId: string } | null,
  ensureCurrentAppUser: vi.fn(),
  saveSeekerNotificationPrefs: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/auth", () => ({
  isClerkConfigured: () => mocks.clerkConfigured,
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));
vi.mock("@/lib/db/seeker-notification-prefs", () => ({
  saveSeekerNotificationPrefs: mocks.saveSeekerNotificationPrefs,
}));

import { updateSeekerNotificationPrefsAction } from "@/app/profile/notifications/actions";

const INITIAL_STATE = { status: "idle", message: "" } as const;

function formWith(
  enabled: Array<
    "email_enabled" | "ready_again" | "ends_today" | "ends_soon"
  >,
): FormData {
  const form = new FormData();
  for (const name of enabled) form.set(name, "on");
  form.set("app_user_id", "attacker-selected-user");
  return form;
}

describe("updateSeekerNotificationPrefsAction", () => {
  beforeEach(() => {
    mocks.clerkConfigured = true;
    mocks.authUser = {
      appUserId: "11111111-1111-4111-8111-111111111111",
    };
    mocks.ensureCurrentAppUser.mockReset();
    mocks.ensureCurrentAppUser.mockImplementation(async () => mocks.authUser);
    mocks.saveSeekerNotificationPrefs.mockReset();
    mocks.saveSeekerNotificationPrefs.mockResolvedValue(undefined);
    mocks.revalidatePath.mockReset();
  });

  it("derives authority server-side, saves the checkbox schema, and reports success", async () => {
    const result = await updateSeekerNotificationPrefsAction(
      INITIAL_STATE,
      formWith(["email_enabled", "ready_again", "ends_soon"]),
    );

    expect(mocks.saveSeekerNotificationPrefs).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        email_enabled: true,
        ready_again: true,
        ends_today: false,
        ends_soon: true,
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/profile/notifications",
    );
    expect(result).toEqual({
      status: "success",
      message: "Reminder preferences saved.",
    });
  });

  it("returns an actionable signed-out state without writing", async () => {
    mocks.authUser = null;

    await expect(
      updateSeekerNotificationPrefsAction(
        INITIAL_STATE,
        formWith(["email_enabled"]),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Sign in again before saving reminder preferences.",
    });
    expect(mocks.saveSeekerNotificationPrefs).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns an accessible failure state and does not revalidate a failed write", async () => {
    mocks.saveSeekerNotificationPrefs.mockRejectedValue(
      new Error("private database detail"),
    );

    await expect(
      updateSeekerNotificationPrefsAction(
        INITIAL_STATE,
        formWith(["ready_again", "ends_today", "ends_soon"]),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "We could not save your reminder preferences. Try again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when account access is not configured", async () => {
    mocks.clerkConfigured = false;

    await expect(
      updateSeekerNotificationPrefsAction(INITIAL_STATE, formWith([])),
    ).resolves.toEqual({
      status: "error",
      message: "Account access is unavailable in this environment.",
    });
    expect(mocks.ensureCurrentAppUser).not.toHaveBeenCalled();
    expect(mocks.saveSeekerNotificationPrefs).not.toHaveBeenCalled();
  });
});
