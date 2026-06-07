"use server";

import { redirect } from "next/navigation";
import { saveNotificationPrefs } from "@/lib/db/host-dashboard";

export async function updateNotificationPrefsAction(formData: FormData) {
  await saveNotificationPrefs({
    email_on_listing_approved: Boolean(formData.get("email_on_listing_approved")),
    email_on_listing_held: Boolean(formData.get("email_on_listing_held")),
    email_on_listing_expiring_soon: Boolean(formData.get("email_on_listing_expiring_soon")),
    email_on_new_reaction: Boolean(formData.get("email_on_new_reaction")),
  });
  redirect("/host/notifications");
}
