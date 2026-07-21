import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  isEmailOutboxSchemaReady,
  isOutboundEmailConfigured,
  isOutboundEmailEnabled,
} from "@/lib/email/outbound-gate";
import { processDueEmailDeliveries } from "@/lib/email/delivery-worker";
import { purgeExpiredEmailDeliveries } from "@/lib/email/delivery-outbox";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function captureOperationalFailure(scope: string, errorCode: string): void {
  Sentry.captureMessage("Sweepza email outbox operation failed", {
    level: "error",
    tags: { scope, error_code: errorCode },
  });
}

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
  if (!schemaReady) {
    if (!enabled) {
      return NextResponse.json({
        ok: true,
        enabled: false,
        configured,
        schemaReady: false,
        reason: "outbound_email_disabled",
        expiredSuppressed: 0,
        payloadExpired: 0,
        providerWindowExpired: 0,
        claimed: 0,
        sent: 0,
        deferred: 0,
        skipped: 0,
        failed: 0,
        retryScheduled: 0,
        recoveryPending: 0,
      });
    }
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

  const supabase = createServiceRoleClient();
  if (!enabled || !configured) {
    try {
      const purged = await purgeExpiredEmailDeliveries(supabase, 50);
      if (purged.suppressed > 0) {
        Sentry.captureMessage("Sweepza expired email payloads were suppressed", {
          level: "warning",
          tags: {
            payload_expired: String(purged.payloadExpired),
            provider_window_expired: String(purged.providerWindowExpired),
          },
        });
      }
      if (!enabled) {
        return NextResponse.json({
          ok: true,
          enabled: false,
          configured,
          schemaReady: true,
          reason: "outbound_email_disabled",
          expiredSuppressed: purged.suppressed,
          payloadExpired: purged.payloadExpired,
          providerWindowExpired: purged.providerWindowExpired,
          claimed: 0,
          sent: 0,
          deferred: 0,
          skipped: 0,
          failed: 0,
          retryScheduled: 0,
          recoveryPending: 0,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          enabled: true,
          configured: false,
          schemaReady: true,
          expiredSuppressed: purged.suppressed,
          error:
            "Outbound email requires a Resend key plus Sweepza-owned From and Reply-To identities.",
        },
        { status: 503 },
      );
    } catch {
      captureOperationalFailure("expiry_purge", "expiry_purge_failed");
      return NextResponse.json(
        { ok: false, error: "Expired email payloads could not be purged." },
        { status: 500 },
      );
    }
  }

  try {
    const summary = await processDueEmailDeliveries(supabase);
    if (summary.expiredSuppressed > 0) {
      Sentry.captureMessage("Sweepza expired email payloads were suppressed", {
        level: "warning",
        tags: {
          payload_expired: String(summary.payloadExpired),
          provider_window_expired: String(summary.providerWindowExpired),
        },
      });
    }
    for (const failure of summary.failureDetails) {
      Sentry.captureMessage("Sweepza email outbox delivery failed", {
        level: "error",
        tags: {
          error_code: failure.code,
          retry_scheduled: String(failure.retryScheduled),
          recovery_pending: String(failure.recoveryPending),
        },
      });
    }
    return NextResponse.json(
      {
        ok: summary.failed === 0,
        enabled: true,
        configured: true,
        schemaReady: true,
        expiredSuppressed: summary.expiredSuppressed,
        payloadExpired: summary.payloadExpired,
        providerWindowExpired: summary.providerWindowExpired,
        claimed: summary.claimed,
        sent: summary.sent,
        deferred: summary.deferred,
        skipped: summary.skipped,
        failed: summary.failed,
        retryScheduled: summary.retryScheduled,
        recoveryPending: summary.recoveryPending,
      },
      { status: summary.failed === 0 ? 200 : 500 },
    );
  } catch {
    captureOperationalFailure("retry_batch", "retry_batch_failed");
    return NextResponse.json(
      { ok: false, error: "Email delivery retry failed before completion." },
      { status: 500 },
    );
  }
}
