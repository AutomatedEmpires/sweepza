"use server";

import { revalidatePath } from "next/cache";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { seekerNotificationPrefsSchema } from "@/lib/seeker-notification-prefs-schema";
import { saveSeekerNotificationPrefs } from "@/lib/db/seeker-notification-prefs";

// Unchecked HTML checkboxes are simply absent from the submitted FormData, so a
// missing key means the toggle is off.
export async function updateSeekerNotificationPrefsAction(
  formData: FormData,
): Promise<void> {
  if (!isClerkConfigured()) return;
  const authUser = await ensureCurrentAppUser();
  if (!authUser) return;

  const parsed = seekerNotificationPrefsSchema.parse({
    email_enabled: formData.get("email_enabled") === "on",
    ready_again: formData.get("ready_again") === "on",
    ends_today: formData.get("ends_today") === "on",
    ends_soon: formData.get("ends_soon") === "on",
  });

  await saveSeekerNotificationPrefs(authUser.appUserId, parsed);
  revalidatePath("/profile/notifications");
}
