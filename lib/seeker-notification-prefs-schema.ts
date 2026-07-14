import { z } from "zod";

// Seeker-managed reminder opt-ins. These are the toggles behind the
// seeker-reminders cron (app/api/cron/seeker-reminders): the master email
// switch plus the three reminder classes it can send. All default on — a
// missing notification_pref row is treated as fully opted in.
export const seekerNotificationPrefsSchema = z.object({
  email_enabled: z.boolean(),
  ready_again: z.boolean(),
  ends_today: z.boolean(),
  ends_soon: z.boolean(),
});

export type SeekerNotificationPrefsInput = z.infer<
  typeof seekerNotificationPrefsSchema
>;

export const DEFAULT_SEEKER_NOTIFICATION_PREFS: SeekerNotificationPrefsInput = {
  email_enabled: true,
  ready_again: true,
  ends_today: true,
  ends_soon: true,
};
