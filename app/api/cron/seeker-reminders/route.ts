import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { APP_URL } from "@/lib/site";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  planSeekerReminders,
  reminderLogKey,
  type ReminderCandidate,
  type ReminderPrefs,
} from "@/lib/seeker-reminders";
import {
  seekerReminderDigestEmail,
  type SeekerReminderItem,
} from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How far back to look for already-sent reminders when deduping. A reminder is
// keyed to its window (re-open date / end date), so any lookback longer than the
// widest window (ending-soon = 3 days) prevents a second send within a window.
const DEDUPE_LOOKBACK_DAYS = 8;
// Cap the digest so a heavy tracker never gets an overwhelming wall of rows.
const MAX_ITEMS_PER_DIGEST = 12;
const REMINDER_TYPES = ["ready_again", "ends_today", "ending_soon"] as const;

interface SeekerStateRow {
  app_user_id: string;
  saved_at: string | null;
  entered_at: string | null;
  skipped_at: string | null;
  won_at: string | null;
  listing: {
    id: string;
    slug: string;
    title: string;
    end_date: string;
    entry_frequency: ReminderCandidate["listing"]["entryFrequency"];
  } | null;
  app_user: {
    id: string;
    email: string | null;
    display_name: string | null;
  } | null;
}

interface PrefRow {
  app_user_id: string;
  ready_again: boolean;
  ends_today: boolean;
  ends_soon: boolean;
  email_enabled: boolean;
}

// Missing pref row ⇒ opted in on every seeker reminder (matches the host path).
function toReminderPrefs(pref: PrefRow | undefined): ReminderPrefs {
  return {
    readyAgain: pref?.ready_again !== false,
    endsToday: pref?.ends_today !== false,
    endsSoon: pref?.ends_soon !== false,
  };
}

/**
 * Seeker reminder cron: the proactive side of "Sweepza remembers so you don't
 * have to." Computes each tracker's due reminders (re-entry windows re-opening,
 * saved/entered sweeps ending), dedupes against notification_log, and sends one
 * urgency-ordered digest per user. Auth mirrors expire-stale: Vercel calls with
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // A batch job that logs 'sent' rows must not run without a real transport, or
  // it would dedupe reminders that were never delivered.
  if (!env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured; seeker reminders are disabled." },
      { status: 503 },
    );
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

  // Candidate rows: sweeps a seeker is tracking (saved or entered) that are still
  // active and public. Won/skipped/expired are filtered later by the planner.
  const { data: rows, error: rowsError } = await supabase
    .from("listing_seeker_state")
    .select(
      `app_user_id, saved_at, entered_at, skipped_at, won_at,
       listing:listing!inner(id, slug, title, end_date, entry_frequency, lifecycle_status, visibility_status),
       app_user:app_user!inner(id, email, display_name)`,
    )
    .eq("listing.lifecycle_status", "active")
    .eq("listing.visibility_status", "public")
    .or("entered_at.not.is.null,saved_at.not.is.null")
    .returns<SeekerStateRow[]>();

  if (rowsError) {
    Sentry.captureException(new Error(`seeker-reminders lookup: ${rowsError.message}`));
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  // Group candidates and collect the user identity we need to send.
  interface UserBucket {
    email: string | null;
    displayName: string | null;
    candidates: ReminderCandidate[];
  }
  const byUser = new Map<string, UserBucket>();
  for (const row of rows ?? []) {
    if (!row.listing || !row.app_user) continue;
    let bucket = byUser.get(row.app_user_id);
    if (!bucket) {
      bucket = {
        email: row.app_user.email,
        displayName: row.app_user.display_name,
        candidates: [],
      };
      byUser.set(row.app_user_id, bucket);
    }
    bucket.candidates.push({
      listing: {
        id: row.listing.id,
        slug: row.listing.slug,
        title: row.listing.title,
        endDate: row.listing.end_date,
        entryFrequency: row.listing.entry_frequency,
      },
      activity: {
        savedAt: row.saved_at,
        enteredAt: row.entered_at,
        skippedAt: row.skipped_at,
        wonAt: row.won_at,
      },
    });
  }

  const userIds = [...byUser.keys()];
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, candidates: 0, emailed: 0, reminders: 0 });
  }

  // Per-user prefs.
  const { data: prefRows } = await supabase
    .from("notification_pref")
    .select("app_user_id, ready_again, ends_today, ends_soon, email_enabled")
    .in("app_user_id", userIds)
    .returns<PrefRow[]>();
  const prefsByUser = new Map((prefRows ?? []).map((p) => [p.app_user_id, p]));

  // Already-delivered reminders, keyed by user + type + listing + window.
  const cutoff = new Date(now.getTime() - DEDUPE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: logRows } = await supabase
    .from("notification_log")
    .select("app_user_id, type, metadata, status, created_at")
    .in("app_user_id", userIds)
    .in("type", [...REMINDER_TYPES])
    .eq("status", "sent")
    .gte("created_at", cutoff)
    .returns<
      Array<{
        app_user_id: string;
        type: string;
        metadata: { listingId?: string; reminderKey?: string } | null;
        status: string;
        created_at: string;
      }>
    >();
  const alreadySent = new Set<string>();
  for (const log of logRows ?? []) {
    const listingId = log.metadata?.listingId;
    const reminderKey = log.metadata?.reminderKey;
    if (listingId && reminderKey) {
      alreadySent.add(`${log.app_user_id}|${log.type}|${listingId}|${reminderKey}`);
    }
  }

  let emailed = 0;
  let reminderCount = 0;
  const failures: string[] = [];

  for (const [appUserId, bucket] of byUser) {
    const prefs = toReminderPrefs(prefsByUser.get(appUserId));
    const planned = planSeekerReminders(bucket.candidates, prefs, now).filter(
      (r) => !alreadySent.has(`${appUserId}|${reminderLogKey(r)}`),
    );
    if (planned.length === 0) continue;

    const emailEnabled = prefsByUser.get(appUserId)?.email_enabled !== false;
    if (!emailEnabled || !bucket.email) continue;

    const toSend = planned.slice(0, MAX_ITEMS_PER_DIGEST);
    const items: SeekerReminderItem[] = toSend.map((r) => ({
      kind: r.type,
      title: r.listing.title,
      listingUrl: `${APP_URL}/sweeps/${r.listing.slug}`,
      endsInDays: r.endsInDays,
    }));

    const { subject, html } = seekerReminderDigestEmail({
      displayName: bucket.displayName ?? "there",
      todayUrl: `${APP_URL}/`,
      items,
    });

    try {
      await sendEmail({ to: bucket.email, subject, html });
    } catch (error) {
      failures.push(appUserId);
      Sentry.captureException(
        error instanceof Error
          ? error
          : new Error(`seeker-reminders send failed for ${appUserId}`),
      );
      continue; // No log rows written ⇒ retried on the next run.
    }

    const logInserts = toSend.map((r) => ({
      app_user_id: appUserId,
      type: r.type,
      channel: "email" as const,
      status: "sent" as const,
      sent_at: now.toISOString(),
      metadata: { listingId: r.listing.id, slug: r.listing.slug, reminderKey: r.reminderKey },
    }));
    const { error: logError } = await supabase.from("notification_log").insert(logInserts);
    if (logError) {
      Sentry.captureException(
        new Error(`seeker-reminders log insert for ${appUserId}: ${logError.message}`),
      );
    }

    emailed += 1;
    reminderCount += toSend.length;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    candidates: userIds.length,
    emailed,
    reminders: reminderCount,
    failed: failures.length,
  });
}
