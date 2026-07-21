import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ReminderCandidate, ReminderPrefs } from "@/lib/seeker-reminders";

const entryFrequencySchema = z.enum([
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "instant_win",
  "other",
]);

const candidateSchema = z.object({
  saved_at: z.string().nullable(),
  entered_at: z.string().nullable(),
  skipped_at: z.string().nullable(),
  won_at: z.string().nullable(),
  listing: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    title: z.string().min(1),
    end_date: z.string().min(1),
    entry_frequency: entryFrequencySchema,
  }),
});

const rawScanRowSchema = z
  .object({
    app_user_id: z.string().uuid(),
    scan_token: z.string().uuid(),
    email: z.string().nullable(),
    display_name: z.string().nullable(),
    ready_again: z.boolean(),
    ends_today: z.boolean(),
    ends_soon: z.boolean(),
    email_enabled: z.boolean(),
    has_more_candidates: z.boolean(),
    next_cursor_end_date: z.string().nullable(),
    next_cursor_listing_id: z.string().uuid().nullable(),
    candidates: z.array(candidateSchema).max(12),
  })
  .superRefine((row, context) => {
    const hasCursor =
      row.next_cursor_end_date !== null && row.next_cursor_listing_id !== null;
    if (row.has_more_candidates !== hasCursor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "candidate continuation cursor mismatch",
      });
    }
  });

export interface ReminderScanUser {
  appUserId: string;
  scanToken: string;
  email: string | null;
  displayName: string | null;
  emailEnabled: boolean;
  prefs: ReminderPrefs;
  hasMoreCandidates: boolean;
  nextCursorEndDate: string | null;
  nextCursorListingId: string | null;
  candidates: ReminderCandidate[];
}

export class ReminderScanPersistenceError extends Error {
  constructor(message: string) {
    super(`Reminder scan claim failed: ${message}`);
    this.name = "ReminderScanPersistenceError";
  }
}

/**
 * Claim a fair, database-bounded producer batch. The RPC returns one row per
 * seeker, so PostgREST row caps cannot silently truncate individual listings.
 */
export async function claimReminderScanBatch(
  supabase: Pick<SupabaseClient, "rpc">,
  limit = 25,
): Promise<ReminderScanUser[]> {
  const { data, error } = await supabase.rpc("claim_seeker_reminder_scan_batch", {
    p_limit: limit,
  });
  if (error) throw new ReminderScanPersistenceError(error.message);

  const parsed = z.array(rawScanRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new ReminderScanPersistenceError("invalid database response");
  }

  return parsed.data.map((row) => ({
    appUserId: row.app_user_id,
    scanToken: row.scan_token,
    email: row.email,
    displayName: row.display_name,
    emailEnabled: row.email_enabled,
    prefs: {
      readyAgain: row.ready_again,
      endsToday: row.ends_today,
      endsSoon: row.ends_soon,
    },
    hasMoreCandidates: row.has_more_candidates,
    nextCursorEndDate: row.next_cursor_end_date,
    nextCursorListingId: row.next_cursor_listing_id,
    candidates: row.candidates.map((candidate) => ({
      listing: {
        id: candidate.listing.id,
        slug: candidate.listing.slug,
        title: candidate.listing.title,
        endDate: candidate.listing.end_date,
        entryFrequency: candidate.listing.entry_frequency,
      },
      activity: {
        savedAt: candidate.saved_at,
        enteredAt: candidate.entered_at,
        skippedAt: candidate.skipped_at,
        wonAt: candidate.won_at,
      },
    })),
  }));
}

export async function completeReminderScan(
  supabase: Pick<SupabaseClient, "rpc">,
  user: ReminderScanUser,
  args: { success: boolean; deferForDay: boolean },
): Promise<void> {
  const { data, error } = await supabase.rpc("complete_seeker_reminder_scan", {
    p_app_user_id: user.appUserId,
    p_scan_token: user.scanToken,
    p_success: args.success,
    p_defer_for_day: args.deferForDay,
    p_has_more_candidates: user.hasMoreCandidates,
    p_next_cursor_end_date: user.nextCursorEndDate,
    p_next_cursor_listing_id: user.nextCursorListingId,
  });
  if (error) throw new ReminderScanPersistenceError(error.message);
  if (data !== true) {
    throw new ReminderScanPersistenceError("scan lease compare-and-set was rejected");
  }
}

/** Return already-reserved email keys for one bounded set of current plans. */
export async function findClaimedReminderEmailKeys(
  supabase: Pick<SupabaseClient, "rpc">,
  appUserId: string,
  dedupeKeys: string[],
): Promise<Set<string>> {
  if (dedupeKeys.length < 1 || dedupeKeys.length > 12) {
    throw new ReminderScanPersistenceError("invalid dedupe key batch");
  }

  const { data, error } = await supabase.rpc("find_claimed_reminder_email_keys", {
    p_app_user_id: appUserId,
    p_dedupe_keys: dedupeKeys,
  });
  if (error) throw new ReminderScanPersistenceError(error.message);

  const parsed = z
    .array(z.object({ dedupe_key: z.string().min(1).max(512) }))
    .safeParse(data ?? []);
  if (!parsed.success) {
    throw new ReminderScanPersistenceError("invalid dedupe history response");
  }
  return new Set(parsed.data.map((row) => row.dedupe_key));
}
