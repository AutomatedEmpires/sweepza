import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { APP_URL } from "@/lib/site";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  planSeekerReminders,
  reminderLogKey,
  MAX_ITEMS_PER_REMINDER_DIGEST,
  type PlannedReminder,
} from "@/lib/seeker-reminders";
import {
  seekerReminderDigestEmail,
  type SeekerReminderItem,
} from "@/lib/email/templates";
import {
  isOutboundEmailConfigured,
  isOutboundEmailEnabled,
  isEmailOutboxSchemaReady,
  requireOutboundEmailConfiguration,
} from "@/lib/email/outbound-gate";
import {
  claimReminderEmailDelivery,
  deliverClaimedEmail,
} from "@/lib/email/delivery-outbox";
import { EmailSendError } from "@/lib/email/send";
import {
  claimReminderScanBatch,
  completeReminderScan,
  findClaimedReminderEmailKeys,
  type ReminderScanUser,
} from "@/lib/email/reminder-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One provider wave leaves at least ~40 seconds of the 60-second invocation for
// database reads, CAS transitions, acknowledgement, and response serialization.
const SCAN_BATCH_SIZE = 10;
const DELIVERY_CONCURRENCY = 10;
const MAX_PROVIDER_RETRY_WINDOW_MS = 22 * 60 * 60 * 1_000;
const EXPECTED_CLAIM_NO_OPS = new Set([
  "already_claimed",
  "preference_disabled",
  "recipient_changed",
  "reminder_no_longer_current",
  "unknown_user",
]);

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

interface UserDeliveryResult {
  status: "sent" | "deferred" | "skipped" | "failed";
  reminders: number;
  retryScheduled: boolean;
  recoveryPending?: boolean;
  scanSucceeded: boolean;
  deferForDay: boolean;
  acknowledged: boolean;
}

function reminderSendBefore(now: Date): string {
  const nextUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return new Date(
    Math.min(nextUtcDay, now.getTime() + MAX_PROVIDER_RETRY_WINDOW_MS),
  ).toISOString();
}

function captureOperationalFailure(scope: string, errorCode: string): void {
  Sentry.captureMessage("Sweepza reminder delivery operation failed", {
    level: "error",
    tags: { scope, error_code: errorCode },
  });
}

function safeTransportCode(error: unknown): string {
  if (error instanceof EmailSendError) {
    return error.providerCode ?? error.kind;
  }
  return "delivery_operation_failed";
}

async function unclaimedReminders(
  supabase: ServiceClient,
  appUserId: string,
  planned: PlannedReminder[],
): Promise<PlannedReminder[]> {
  if (planned.length === 0) return [];

  const keys = planned.map(reminderLogKey);
  const claimed = await findClaimedReminderEmailKeys(supabase, appUserId, keys);
  return planned.filter((reminder) => !claimed.has(reminderLogKey(reminder)));
}

async function processUser(
  supabase: ServiceClient,
  user: ReminderScanUser,
  sender: { from: string; replyTo: string },
  now: Date,
): Promise<UserDeliveryResult> {
  let durableClaimed = false;
  try {
    if (!user.emailEnabled || !user.email) {
      return {
        status: "skipped",
        reminders: 0,
        retryScheduled: false,
        scanSucceeded: true,
        deferForDay: true,
        acknowledged: false,
      };
    }

    const planned = await unclaimedReminders(
      supabase,
      user.appUserId,
      planSeekerReminders(user.candidates, user.prefs, now, "UTC"),
    );
    const toSend = planned.slice(0, MAX_ITEMS_PER_REMINDER_DIGEST);
    if (toSend.length === 0) {
      return {
        status: "skipped",
        reminders: 0,
        retryScheduled: false,
        scanSucceeded: true,
        deferForDay: !user.hasMoreCandidates,
        acknowledged: false,
      };
    }

    const items: SeekerReminderItem[] = toSend.map((reminder) => ({
      kind: reminder.type,
      title: reminder.listing.title,
      listingUrl: `${APP_URL}/sweeps/${reminder.listing.slug}`,
      endsInDays: reminder.endsInDays,
    }));
    const { subject, html } = seekerReminderDigestEmail({
      displayName: user.displayName ?? "there",
      todayUrl: `${APP_URL}/`,
      items,
    });

    const claim = await claimReminderEmailDelivery(supabase, {
      appUserId: user.appUserId,
      recipient: user.email,
      sender: sender.from,
      replyTo: sender.replyTo,
      subject,
      html,
      sendBefore: reminderSendBefore(now),
      events: toSend.map((reminder) => ({
        type: reminder.type,
        dedupeKey: reminderLogKey(reminder),
        metadata: {
          listingId: reminder.listing.id,
          slug: reminder.listing.slug,
          title: reminder.listing.title,
          endDate: reminder.listing.endDate,
          entryFrequency: reminder.listing.entryFrequency,
          reminderKey: reminder.reminderKey,
        },
      })),
    });

    if (!claim.claimed) {
      if (!EXPECTED_CLAIM_NO_OPS.has(claim.reason)) {
        captureOperationalFailure("claim", "claim_rejected");
        return {
          status: "failed",
          reminders: 0,
          retryScheduled: false,
          scanSucceeded: false,
          deferForDay: false,
          acknowledged: false,
        };
      }
      return {
        status: "skipped",
        reminders: 0,
        retryScheduled: false,
        scanSucceeded: true,
        deferForDay: true,
        acknowledged: false,
      };
    }

    durableClaimed = true;
    const outcome = await deliverClaimedEmail(supabase, claim.delivery);
    if (outcome.status === "sent") {
      return {
        status: "sent",
        reminders: toSend.length,
        retryScheduled: false,
        scanSucceeded: true,
        deferForDay: true,
        acknowledged: false,
      };
    }
    if (outcome.status === "skipped") {
      return {
        status: "skipped",
        reminders: 0,
        retryScheduled: false,
        scanSucceeded: true,
        deferForDay: true,
        acknowledged: false,
      };
    }
    if (outcome.status === "deferred") {
      return {
        status: "deferred",
        reminders: 0,
        retryScheduled: true,
        scanSucceeded: true,
        deferForDay: true,
        acknowledged: false,
      };
    }

    captureOperationalFailure("transport", safeTransportCode(outcome.error));
    return {
      status: "failed",
      reminders: 0,
      retryScheduled: outcome.retryScheduled,
      scanSucceeded: true,
      deferForDay: true,
      acknowledged: false,
    };
  } catch (error) {
    captureOperationalFailure("user_delivery", safeTransportCode(error));
    return {
      status: "failed",
      reminders: 0,
      retryScheduled: false,
      recoveryPending: durableClaimed,
      scanSucceeded: durableClaimed,
      deferForDay: durableClaimed,
      acknowledged: false,
    };
  }
}

async function processAndAcknowledgeUser(
  supabase: ServiceClient,
  user: ReminderScanUser,
  sender: { from: string; replyTo: string },
  now: Date,
): Promise<UserDeliveryResult> {
  const result = await processUser(supabase, user, sender, now);
  try {
    await completeReminderScan(supabase, user, {
      success: result.scanSucceeded,
      deferForDay: result.deferForDay,
    });
    return { ...result, acknowledged: true };
  } catch {
    captureOperationalFailure("scan_completion", "scan_completion_failed");
    return result;
  }
}

/**
 * Producer for proactive seeker reminders. A service-only database claim rotates
 * through a bounded seeker batch, exact planned keys are checked on the email
 * channel, and provider calls run in small bounded waves under the function cap.
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

  const enabled = isOutboundEmailEnabled();
  const configured = isOutboundEmailConfigured();
  const schemaReady = isEmailOutboxSchemaReady();
  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      configured,
      schemaReady,
      reason: "outbound_email_disabled",
      candidates: 0,
      emailed: 0,
      deferred: 0,
      reminders: 0,
      failed: 0,
    });
  }
  if (!schemaReady) {
    return NextResponse.json(
      {
        ok: false,
        enabled: true,
        configured,
        schemaReady: false,
        error: "The durable email outbox schema is not activated.",
      },
      { status: 503 },
    );
  }
  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        enabled: true,
        configured: false,
        error:
          "Outbound email requires a Resend key plus Sweepza-owned From and Reply-To identities.",
      },
      { status: 503 },
    );
  }

  const { from, replyTo } = requireOutboundEmailConfiguration();
  const supabase = createServiceRoleClient();
  let users: ReminderScanUser[];
  try {
    users = await claimReminderScanBatch(supabase, SCAN_BATCH_SIZE);
  } catch {
    captureOperationalFailure("scan_claim", "scan_claim_failed");
    return NextResponse.json(
      { ok: false, error: "Reminder candidates could not be claimed." },
      { status: 500 },
    );
  }

  const results: UserDeliveryResult[] = [];
  const now = new Date();
  for (let index = 0; index < users.length; index += DELIVERY_CONCURRENCY) {
    const wave = users.slice(index, index + DELIVERY_CONCURRENCY);
    results.push(
      ...(await Promise.all(
        wave.map((user) =>
          processAndAcknowledgeUser(supabase, user, { from, replyTo }, now),
        ),
      )),
    );
  }

  const emailed = results.filter((result) => result.status === "sent").length;
  const deferred = results.filter(
    (result) => result.status === "deferred",
  ).length;
  const failed = results.filter(
    (result) => result.status === "failed" || !result.acknowledged,
  ).length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const reminders = results.reduce((sum, result) => sum + result.reminders, 0);
  const retryScheduled = results.filter((result) => result.retryScheduled).length;
  const recoveryPending = results.filter((result) => result.recoveryPending).length;

  return NextResponse.json(
    {
      ok: failed === 0,
      enabled: true,
      configured: true,
      candidates: users.length,
      emailed,
      deferred,
      reminders,
      skipped,
      failed,
      retryScheduled,
      recoveryPending,
    },
    { status: failed === 0 ? 200 : 500 },
  );
}
