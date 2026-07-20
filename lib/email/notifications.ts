import "server-only";

import {
  listingApprovedEmail,
  listingExpiringSoonEmail,
  listingHeldEmail,
  winnerPostPublishedEmail,
  type EmailContent,
} from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { OutboundEmailConfigurationError } from "@/lib/email/outbound-gate";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type HostNotificationType =
  | "listing_approved"
  | "listing_held"
  | "listing_expiring_soon";

const PREF_KEY_BY_TYPE: Record<
  HostNotificationType,
  | "email_on_listing_approved"
  | "email_on_listing_held"
  | "email_on_listing_expiring_soon"
> = {
  listing_approved: "email_on_listing_approved",
  listing_held: "email_on_listing_held",
  listing_expiring_soon: "email_on_listing_expiring_soon",
};

type PrefRecord = Record<string, unknown> | null;

// Treat a missing row or missing column as opted-in (defaults all true).
function prefEnabled(pref: PrefRecord, key: string): boolean {
  if (!pref) return true;
  return pref[key] !== false;
}

function buildHostEmail(
  type: HostNotificationType,
  payload: Record<string, string>,
): EmailContent {
  switch (type) {
    case "listing_approved":
      return listingApprovedEmail({
        hostName: payload.hostName ?? "there",
        listingTitle: payload.listingTitle ?? "",
        listingUrl: payload.listingUrl ?? "",
      });
    case "listing_held":
      return listingHeldEmail({
        hostName: payload.hostName ?? "there",
        listingTitle: payload.listingTitle ?? "",
        reviewNotes: payload.reviewNotes ?? "",
      });
    case "listing_expiring_soon":
      return listingExpiringSoonEmail({
        hostName: payload.hostName ?? "there",
        listingTitle: payload.listingTitle ?? "",
        endDate: payload.endDate ?? "",
        listingUrl: payload.listingUrl ?? "",
      });
  }
}

async function writeLog(
  appUserId: string,
  type: string,
  status: "sent" | "skipped" | "failed",
  payload: Record<string, string>,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("notification_log").insert({
    app_user_id: appUserId,
    type,
    channel: "email",
    status,
    sent_at: status === "sent" ? new Date().toISOString() : null,
    metadata: payload,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`notification_log insert failed: ${error.message}`);
  }
}

function deliveryFailureReason(error: unknown): string {
  return error instanceof OutboundEmailConfigurationError
    ? "outbound_email_misconfigured"
    : "outbound_email_delivery_failed";
}

/**
 * Send an email notification to a host for a listing lifecycle event.
 * Honors the host's per-event email preference and channel toggle. Once a
 * recipient is resolved, records a sent/skipped/failed delivery outcome; log
 * insertion failures are reported to stderr.
 */
export async function sendHostNotification(args: {
  hostId: string;
  type: HostNotificationType;
  payload: Record<string, string>;
}): Promise<void> {
  const { hostId, type, payload } = args;
  const supabase = createServiceRoleClient();

  const { data: host } = await supabase
    .from("host")
    .select("app_user_id")
    .eq("id", hostId)
    .maybeSingle<{ app_user_id: string }>();

  if (!host) {
    // eslint-disable-next-line no-console
    console.error(`sendHostNotification: host ${hostId} not found`);
    return;
  }

  const appUserId = host.app_user_id;

  const { data: appUser } = await supabase
    .from("app_user")
    .select("email")
    .eq("id", appUserId)
    .maybeSingle<{ email: string | null }>();

  const { data: pref } = await supabase
    .from("notification_pref")
    .select("*")
    .eq("app_user_id", appUserId)
    .maybeSingle<Record<string, unknown>>();

  const email = appUser?.email ?? null;
  const eventEnabled = prefEnabled(pref, PREF_KEY_BY_TYPE[type]);
  const channelEnabled = prefEnabled(pref, "email_enabled");

  if (eventEnabled && channelEnabled && email) {
    const { subject, html } = buildHostEmail(type, payload);
    try {
      const result = await sendEmail({ to: email, subject, html });
      await writeLog(
        appUserId,
        type,
        result.status,
        result.status === "skipped"
          ? { ...payload, delivery_reason: result.reason }
          : payload,
      );
    } catch (error) {
      await writeLog(appUserId, type, "failed", {
        ...payload,
        delivery_reason: deliveryFailureReason(error),
      });
      throw error;
    }
  } else {
    await writeLog(appUserId, type, "skipped", payload);
  }
}

/**
 * Send the winner-post-published email to the post author.
 * Honors the email channel toggle and winner_wall_verification preference.
 * Once a recipient is resolved, records a sent/skipped/failed delivery outcome;
 * log insertion failures are reported to stderr.
 */
export async function sendWinnerNotification(args: {
  appUserId: string;
  payload: Record<string, string>;
}): Promise<void> {
  const { appUserId, payload } = args;
  const type = "winner_post_published";
  const supabase = createServiceRoleClient();

  const { data: appUser } = await supabase
    .from("app_user")
    .select("email")
    .eq("id", appUserId)
    .maybeSingle<{ email: string | null }>();

  const { data: pref } = await supabase
    .from("notification_pref")
    .select("*")
    .eq("app_user_id", appUserId)
    .maybeSingle<Record<string, unknown>>();

  const email = appUser?.email ?? null;
  const eventEnabled = prefEnabled(pref, "winner_wall_verification");
  const channelEnabled = prefEnabled(pref, "email_enabled");

  if (eventEnabled && channelEnabled && email) {
    const { subject, html } = winnerPostPublishedEmail({
      displayName: payload.displayName ?? "there",
      listingTitle: payload.listingTitle ?? "",
      winnersUrl: payload.winnersUrl ?? "",
    });
    try {
      const result = await sendEmail({ to: email, subject, html });
      await writeLog(
        appUserId,
        type,
        result.status,
        result.status === "skipped"
          ? { ...payload, delivery_reason: result.reason }
          : payload,
      );
    } catch (error) {
      await writeLog(appUserId, type, "failed", {
        ...payload,
        delivery_reason: deliveryFailureReason(error),
      });
      throw error;
    }
  } else {
    await writeLog(appUserId, type, "skipped", payload);
  }
}
