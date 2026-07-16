import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  DEFAULT_SEEKER_NOTIFICATION_PREFS,
  type SeekerNotificationPrefsInput,
} from "@/lib/seeker-notification-prefs-schema";

const PREF_COLUMNS = "email_enabled, ready_again, ends_today, ends_soon";

/** Current seeker reminder prefs, defaulting to fully opted-in when no row. */
export async function getSeekerNotificationPrefs(
  appUserId: string,
): Promise<SeekerNotificationPrefsInput> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("notification_pref")
    .select(PREF_COLUMNS)
    .eq("app_user_id", appUserId)
    .maybeSingle<SeekerNotificationPrefsInput>();

  if (error) {
    throw new Error(`getSeekerNotificationPrefs failed: ${error.message}`);
  }
  return data ?? DEFAULT_SEEKER_NOTIFICATION_PREFS;
}

/** Upsert seeker reminder prefs, preserving every other notification column. */
export async function saveSeekerNotificationPrefs(
  appUserId: string,
  prefs: SeekerNotificationPrefsInput,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("notification_pref").upsert(
    {
      app_user_id: appUserId,
      ...prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "app_user_id" },
  );
  if (error) {
    throw new Error(`saveSeekerNotificationPrefs failed: ${error.message}`);
  }
}
