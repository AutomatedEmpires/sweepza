import { z } from "zod";

// Host-managed transactional email opt-ins. All booleans, all default true
// when no row exists yet.
export const notificationPrefsSchema = z.object({
  email_on_listing_approved: z.boolean(),
  email_on_listing_held: z.boolean(),
  email_on_listing_expiring_soon: z.boolean(),
  email_on_new_reaction: z.boolean(),
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsInput = {
  email_on_listing_approved: true,
  email_on_listing_held: true,
  email_on_listing_expiring_soon: true,
  email_on_new_reaction: true,
};
