import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  claimDueEmailDeliveries,
  deliverClaimedEmail,
  EmailDeliveryPersistenceError,
  purgeExpiredEmailDeliveries,
  suppressEmailDelivery,
  type ClaimedEmailDelivery,
} from "@/lib/email/delivery-outbox";
import { EmailSendError } from "@/lib/email/send";
import {
  planSeekerReminders,
  reminderLogKey,
  type ReminderCandidate,
  type ReminderPrefs,
  type SeekerReminderType,
} from "@/lib/seeker-reminders";

const DELIVERY_CONCURRENCY = 5;
const MAX_DELIVERIES_PER_INVOCATION = 5;
const TERMINAL_INTEGRITY_REASONS = new Set([
  "invalid_delivery_metadata",
  "unsupported_delivery_type",
]);

interface DeliveryUserRow {
  id: string;
  email: string | null;
}

interface DeliveryPrefRow {
  app_user_id: string;
  email_enabled: boolean;
  ready_again: boolean;
  ends_today: boolean;
  ends_soon: boolean;
}

interface DeliveryStateRow {
  app_user_id: string;
  listing_id: string;
  saved_at: string | null;
  entered_at: string | null;
  skipped_at: string | null;
  won_at: string | null;
  listing: {
    id: string;
    slug: string;
    title: string;
    end_date: string;
    entry_frequency: ReminderCandidate["listing"]["entryFrequency"] | null;
  } | null;
}

const entryFrequencySchema = z.enum([
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "instant_win",
  "other",
]);

const reminderEventSchema = z.object({
  type: z.enum(["ready_again", "ends_today", "ending_soon"]),
  dedupe_key: z.string().min(1).max(512),
  metadata: z.object({
    listingId: z.string().uuid(),
    slug: z.string().min(1),
    reminderKey: z.string().min(1),
    title: z.string().min(1).optional(),
    endDate: z.string().min(1).optional(),
    entryFrequency: entryFrequencySchema.optional(),
  }),
});

const reminderMetadataSchema = z.object({
  events: z.array(reminderEventSchema).min(1).max(12),
});

type ReminderDeliveryMetadata = z.infer<typeof reminderMetadataSchema>;

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function reminderEventEnabled(
  type: SeekerReminderType,
  pref: DeliveryPrefRow | undefined,
): boolean {
  if (pref?.email_enabled === false) return false;
  if (type === "ready_again") return pref?.ready_again !== false;
  if (type === "ends_today") return pref?.ends_today !== false;
  return pref?.ends_soon !== false;
}

function toReminderPrefs(pref: DeliveryPrefRow | undefined): ReminderPrefs {
  return {
    readyAgain: pref?.ready_again !== false,
    endsToday: pref?.ends_today !== false,
    endsSoon: pref?.ends_soon !== false,
  };
}

function stateKey(appUserId: string, listingId: string): string {
  return `${appUserId}|${listingId}`;
}

function reminderCandidate(row: DeliveryStateRow): ReminderCandidate | null {
  if (!row.listing) return null;
  return {
    listing: {
      id: row.listing.id,
      slug: row.listing.slug,
      title: row.listing.title,
      endDate: row.listing.end_date,
      entryFrequency: row.listing.entry_frequency ?? "other",
    },
    activity: {
      savedAt: row.saved_at,
      enteredAt: row.entered_at,
      skippedAt: row.skipped_at,
      wonAt: row.won_at,
    },
  };
}

function reminderSnapshotMatches(
  event: ReminderDeliveryMetadata["events"][number],
  candidate: ReminderCandidate,
): boolean {
  const snapshot = event.metadata;
  if (candidate.listing.id !== snapshot.listingId) return false;
  if (candidate.listing.slug !== snapshot.slug) return false;
  if (snapshot.title !== undefined && candidate.listing.title !== snapshot.title) {
    return false;
  }
  if (snapshot.endDate !== undefined && candidate.listing.endDate !== snapshot.endDate) {
    return false;
  }
  if (
    snapshot.entryFrequency !== undefined &&
    candidate.listing.entryFrequency !== snapshot.entryFrequency
  ) {
    return false;
  }
  return true;
}

function reminderDeliveryIsCurrent(
  delivery: ClaimedEmailDelivery,
  metadata: ReminderDeliveryMetadata,
  pref: DeliveryPrefRow | undefined,
  statesByUserAndListing: Map<string, DeliveryStateRow>,
  now: Date,
): boolean {
  const prefs = toReminderPrefs(pref);
  return metadata.events.every((event) => {
    const row = statesByUserAndListing.get(
      stateKey(delivery.appUserId, event.metadata.listingId),
    );
    if (!row) return false;
    const candidate = reminderCandidate(row);
    if (!candidate || !reminderSnapshotMatches(event, candidate)) return false;

    const planned = planSeekerReminders([candidate], prefs, now, "UTC");
    if (planned.length !== 1) return false;
    const reminder = planned[0];
    return (
      reminder.type === event.type &&
      reminder.reminderKey === event.metadata.reminderKey &&
      reminderLogKey(reminder) === event.dedupe_key
    );
  });
}

function suppressionReason(
  delivery: ClaimedEmailDelivery,
  user: DeliveryUserRow | undefined,
  pref: DeliveryPrefRow | undefined,
  metadata: ReminderDeliveryMetadata | null,
  statesByUserAndListing: Map<string, DeliveryStateRow>,
  now: Date,
): string | null {
  if (!user?.email) return "recipient_unavailable";
  if (normalizedEmail(user.email) !== normalizedEmail(delivery.recipient)) {
    return "recipient_changed";
  }
  if (delivery.notificationType !== "seeker_reminder_digest") {
    return "unsupported_delivery_type";
  }

  if (!metadata) return "invalid_delivery_metadata";
  if (metadata.events.some((event) => !reminderEventEnabled(event.type, pref))) {
    return "notification_preference_changed";
  }
  if (!reminderDeliveryIsCurrent(delivery, metadata, pref, statesByUserAndListing, now)) {
    return "reminder_no_longer_current";
  }
  return null;
}

export interface DueDeliveryFailureSummary {
  deliveryId: string;
  code: string;
  retryScheduled: boolean;
  recoveryPending: boolean;
}

export interface DueDeliverySummary {
  expiredSuppressed: number;
  payloadExpired: number;
  providerWindowExpired: number;
  claimed: number;
  sent: number;
  deferred: number;
  skipped: number;
  failed: number;
  retryScheduled: number;
  recoveryPending: number;
  failureDetails: DueDeliveryFailureSummary[];
}

function safeErrorCode(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || "unknown";
}

function failureCode(error: unknown): string {
  if (error instanceof EmailDeliveryPersistenceError) {
    return `persistence_${safeErrorCode(error.operation)}`;
  }
  if (error instanceof EmailSendError) {
    return `transport_${safeErrorCode(error.providerCode ?? error.kind)}`;
  }
  return "unexpected_delivery_failure";
}

/**
 * Claim and process the bounded email retry queue. All current recipient and
 * preference reads complete successfully before any provider request begins.
 */
export async function processDueEmailDeliveries(
  supabase: SupabaseClient,
  limit = MAX_DELIVERIES_PER_INVOCATION,
): Promise<DueDeliverySummary> {
  const claimLimit = Math.min(
    Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 1, 1),
    MAX_DELIVERIES_PER_INVOCATION,
  );
  const purged = await purgeExpiredEmailDeliveries(supabase, 50);
  const deliveries = await claimDueEmailDeliveries(supabase, claimLimit);
  const summary: DueDeliverySummary = {
    expiredSuppressed: purged.suppressed,
    payloadExpired: purged.payloadExpired,
    providerWindowExpired: purged.providerWindowExpired,
    claimed: deliveries.length,
    sent: 0,
    deferred: 0,
    skipped: 0,
    failed: 0,
    retryScheduled: 0,
    recoveryPending: 0,
    failureDetails: [],
  };
  if (deliveries.length === 0) return summary;

  const parsedMetadataByDelivery = new Map<string, ReminderDeliveryMetadata | null>();
  const listingIds = new Set<string>();
  for (const delivery of deliveries) {
    const parsed = reminderMetadataSchema.safeParse(delivery.metadata);
    const metadata = parsed.success ? parsed.data : null;
    parsedMetadataByDelivery.set(delivery.deliveryId, metadata);
    for (const event of metadata?.events ?? []) {
      listingIds.add(event.metadata.listingId);
    }
  }

  const userIds = [...new Set(deliveries.map((delivery) => delivery.appUserId))];
  const stateListingIds = [...listingIds];
  const statesPromise =
    stateListingIds.length === 0
      ? Promise.resolve({ data: [] as DeliveryStateRow[], error: null })
      : supabase
          .from("listing_seeker_state")
          .select(
            `app_user_id, listing_id, saved_at, entered_at, skipped_at, won_at,
             listing:listing!inner(id, slug, title, end_date, entry_frequency, lifecycle_status, visibility_status)`,
          )
          .in("app_user_id", userIds)
          .in("listing_id", stateListingIds)
          .eq("listing.lifecycle_status", "active")
          .eq("listing.visibility_status", "public")
          .returns<DeliveryStateRow[]>();
  const [usersResult, prefsResult, statesResult] = await Promise.all([
    supabase
      .from("app_user")
      .select("id, email")
      .in("id", userIds)
      .returns<DeliveryUserRow[]>(),
    supabase
      .from("notification_pref")
      .select("app_user_id, email_enabled, ready_again, ends_today, ends_soon")
      .in("app_user_id", userIds)
      .returns<DeliveryPrefRow[]>(),
    statesPromise,
  ]);
  if (usersResult.error) {
    throw new EmailDeliveryPersistenceError(
      "retry recipient lookup",
      usersResult.error.message,
    );
  }
  if (prefsResult.error) {
    throw new EmailDeliveryPersistenceError(
      "retry preference lookup",
      prefsResult.error.message,
    );
  }
  if (statesResult.error) {
    throw new EmailDeliveryPersistenceError(
      "retry reminder state lookup",
      statesResult.error.message,
    );
  }

  const usersById = new Map((usersResult.data ?? []).map((user) => [user.id, user]));
  const prefsById = new Map(
    (prefsResult.data ?? []).map((pref) => [pref.app_user_id, pref]),
  );
  const statesByUserAndListing = new Map(
    (statesResult.data ?? []).map((state) => [
      stateKey(state.app_user_id, state.listing_id),
      state,
    ]),
  );
  const now = new Date();

  for (let index = 0; index < deliveries.length; index += DELIVERY_CONCURRENCY) {
    const wave = deliveries.slice(index, index + DELIVERY_CONCURRENCY);
    await Promise.all(
      wave.map(async (delivery) => {
        try {
          const reason = suppressionReason(
            delivery,
            usersById.get(delivery.appUserId),
            prefsById.get(delivery.appUserId),
            parsedMetadataByDelivery.get(delivery.deliveryId) ?? null,
            statesByUserAndListing,
            now,
          );
          if (reason) {
            await suppressEmailDelivery(supabase, delivery, reason);
            if (TERMINAL_INTEGRITY_REASONS.has(reason)) {
              summary.failed += 1;
              summary.failureDetails.push({
                deliveryId: delivery.deliveryId,
                code: `integrity_${reason}`,
                retryScheduled: false,
                recoveryPending: false,
              });
            } else {
              summary.skipped += 1;
            }
            return;
          }

          const outcome = await deliverClaimedEmail(supabase, delivery);
          if (outcome.status === "sent") {
            summary.sent += 1;
          } else if (outcome.status === "deferred") {
            summary.deferred += 1;
            summary.retryScheduled += 1;
          } else if (outcome.status === "skipped") {
            summary.skipped += 1;
          } else {
            summary.failed += 1;
            if (outcome.retryScheduled) summary.retryScheduled += 1;
            summary.failureDetails.push({
              deliveryId: delivery.deliveryId,
              code: failureCode(outcome.error),
              retryScheduled: outcome.retryScheduled,
              recoveryPending: false,
            });
          }
        } catch (error) {
          summary.failed += 1;
          summary.recoveryPending += 1;
          summary.failureDetails.push({
            deliveryId: delivery.deliveryId,
            code: failureCode(error),
            retryScheduled: false,
            recoveryPending: true,
          });
        }
      }),
    );
  }

  return summary;
}
