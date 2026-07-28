"use server";

import { revalidatePath } from "next/cache";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { seekerNotificationPrefsSchema } from "@/lib/seeker-notification-prefs-schema";
import { saveSeekerNotificationPrefs } from "@/lib/db/seeker-notification-prefs";

export type ReminderPreferencesActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

// Unchecked HTML checkboxes are simply absent from the submitted FormData, so a
// missing key means the toggle is off.
export async function updateSeekerNotificationPrefsAction(
  _previousState: ReminderPreferencesActionState,
  formData: FormData,
): Promise<ReminderPreferencesActionState> {
  if (!isClerkConfigured()) {
    return {
      status: "error",
      message: "Account access is unavailable in this environment.",
    };
  }

  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return {
      status: "error",
      message: "Sign in again before saving reminder preferences.",
    };
  }

  const parsed = seekerNotificationPrefsSchema.safeParse({
    email_enabled: formData.get("email_enabled") === "on",
    ready_again: formData.get("ready_again") === "on",
    ends_today: formData.get("ends_today") === "on",
    ends_soon: formData.get("ends_soon") === "on",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Review your reminder choices and try again.",
    };
  }

  try {
    // appUserId is derived from the authenticated server session. Never trust a
    // form field to choose which user's preferences are updated.
    await saveSeekerNotificationPrefs(authUser.appUserId, parsed.data);
  } catch {
    return {
      status: "error",
      message: "We could not save your reminder preferences. Try again.",
    };
  }

  revalidatePath("/profile/notifications");
  return {
    status: "success",
    message: "Reminder preferences saved.",
  };
}
