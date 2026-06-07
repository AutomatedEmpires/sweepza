"use server";

import { revalidatePath } from "next/cache";
import { saveNotificationPrefs } from "@/lib/db/host-dashboard";

export async function updateNotificationPrefsAction(formData: FormData): Promise<void> {
  await saveNotificationPrefs({
    email_on_listing_approved: formData.get("email_on_listing_approved") === "on",
    email_on_listing_held: formData.get("email_on_listing_held") === "on",
    email_on_listing_expiring_soon: formData.get("email_on_listing_expiring_soon") === "on",
    email_on_new_reaction: formData.get("email_on_new_reaction") === "on",
  });
  revalidatePath("/host/notifications");
}
