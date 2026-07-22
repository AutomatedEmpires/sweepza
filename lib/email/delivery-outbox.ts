import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { OutboundEmailConfigurationError } from "@/lib/email/outbound-gate";
import { EmailSendError, sendEmail } from "@/lib/email/send";
import type { SeekerReminderType } from "@/lib/seeker-reminders";

type RpcClient = Pick<SupabaseClient, "rpc">;

const rawDeliverySchema = z.object({
  delivery_id: z.string().uuid(),
  app_user_id: z.string().uuid(),
  notification_type: z.string().min(1),
  idempotency_key: z.string().min(1).max(256),
  recipient: z.string().min(1),
  sender: z.string().min(1),
  reply_to: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  metadata: z.record(z.unknown()),
  lease_token: z.string().uuid(),
  attempt_count: z.number().int().nonnegative(),
  send_before: z.string().min(1),
});

const rawClaimResultSchema = z.object({
  claimed: z.boolean(),
  reason: z.string().optional(),
  delivery: rawDeliverySchema.optional(),
});

const rawFailureResultSchema = z.object({
  recorded: z.boolean(),
  reason: z.string().optional(),
  retry_scheduled: z.boolean().optional(),
  next_attempt_at: z.string().nullable().optional(),
});

const rawPurgeResultSchema = z.object({
  suppressed: z.number().int().nonnegative(),
  payload_expired: z.number().int().nonnegative(),
  provider_window_expired: z.number().int().nonnegative(),
  notification_logs_updated: z.number().int().nonnegative(),
});

const transportSuppressionReasonSchema = z.enum([
  "recipient_unavailable",
  "recipient_changed",
  "notification_preference_changed",
  "reminder_no_longer_current",
  "invalid_delivery_metadata",
  "unsupported_delivery_type",
  "reminder_payload_expired",
  "provider_idempotency_window_expired",
]);

const transportAuthorizationReasonSchema = z.union([
  transportSuppressionReasonSchema,
  z.enum([
    "cas_miss",
    "lease_window_closing",
    "provider_rate_window_full",
  ]),
]);

const rawTransportAuthorizationSchema = z.discriminatedUnion("authorized", [
  z.object({
    authorized: z.literal(true),
    suppressed: z.literal(false),
  }),
  z.object({
    authorized: z.literal(false),
    suppressed: z.boolean(),
    deferred: z.boolean().optional(),
    reason: transportAuthorizationReasonSchema,
  }),
]);

type RawDelivery = z.infer<typeof rawDeliverySchema>;

export interface ClaimedEmailDelivery {
  deliveryId: string;
  appUserId: string;
  notificationType: string;
  idempotencyKey: string;
  recipient: string;
  sender: string;
  replyTo: string;
  subject: string;
  html: string;
  metadata: Record<string, unknown>;
  leaseToken: string;
  attemptCount: number;
  sendBefore: string;
}

export interface ReminderDeliveryEvent {
  type: SeekerReminderType;
  dedupeKey: string;
  metadata: Record<string, unknown>;
}

export class EmailDeliveryPersistenceError extends Error {
  readonly operation: string;

  constructor(operation: string, message: string) {
    super(`Email delivery ${operation} failed: ${message}`);
    this.name = "EmailDeliveryPersistenceError";
    this.operation = operation;
  }
}

function deliveryFromRaw(raw: RawDelivery): ClaimedEmailDelivery {
  return {
    deliveryId: raw.delivery_id,
    appUserId: raw.app_user_id,
    notificationType: raw.notification_type,
    idempotencyKey: raw.idempotency_key,
    recipient: raw.recipient,
    sender: raw.sender,
    replyTo: raw.reply_to,
    subject: raw.subject,
    html: raw.html,
    metadata: raw.metadata,
    leaseToken: raw.lease_token,
    attemptCount: raw.attempt_count,
    sendBefore: raw.send_before,
  };
}

function invalidResponse(operation: string): EmailDeliveryPersistenceError {
  return new EmailDeliveryPersistenceError(operation, "invalid database response");
}

export async function claimReminderEmailDelivery(
  supabase: RpcClient,
  args: {
    appUserId: string;
    recipient: string;
    sender: string;
    replyTo: string;
    subject: string;
    html: string;
    sendBefore: string;
    events: ReminderDeliveryEvent[];
  },
): Promise<
  | { claimed: true; delivery: ClaimedEmailDelivery }
  | { claimed: false; reason: string }
> {
  const { data, error } = await supabase.rpc("claim_reminder_email_delivery", {
    p_app_user_id: args.appUserId,
    p_recipient: args.recipient,
    p_sender: args.sender,
    p_reply_to: args.replyTo,
    p_subject: args.subject,
    p_html: args.html,
    p_send_before: args.sendBefore,
    p_events: args.events.map((event) => ({
      type: event.type,
      dedupe_key: event.dedupeKey,
      metadata: event.metadata,
    })),
  });
  if (error) {
    throw new EmailDeliveryPersistenceError("claim", error.message);
  }

  const parsed = rawClaimResultSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse("claim");
  if (!parsed.data.claimed) {
    return { claimed: false, reason: parsed.data.reason ?? "not_claimed" };
  }
  if (!parsed.data.delivery) throw invalidResponse("claim");
  return { claimed: true, delivery: deliveryFromRaw(parsed.data.delivery) };
}

export async function claimDueEmailDeliveries(
  supabase: RpcClient,
  limit = 5,
): Promise<ClaimedEmailDelivery[]> {
  const { data, error } = await supabase.rpc("claim_due_email_deliveries", {
    p_limit: limit,
  });
  if (error) {
    throw new EmailDeliveryPersistenceError("retry claim", error.message);
  }

  const parsed = z.array(rawDeliverySchema).safeParse(data ?? []);
  if (!parsed.success) throw invalidResponse("retry claim");
  return parsed.data.map(deliveryFromRaw);
}

export interface EmailDeliveryPurgeSummary {
  suppressed: number;
  payloadExpired: number;
  providerWindowExpired: number;
  notificationLogsUpdated: number;
}

export async function purgeExpiredEmailDeliveries(
  supabase: RpcClient,
  limit = 50,
): Promise<EmailDeliveryPurgeSummary> {
  const { data, error } = await supabase.rpc("purge_expired_email_deliveries", {
    p_limit: limit,
  });
  if (error) {
    throw new EmailDeliveryPersistenceError("expiry purge", error.message);
  }

  const parsed = rawPurgeResultSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse("expiry purge");
  return {
    suppressed: parsed.data.suppressed,
    payloadExpired: parsed.data.payload_expired,
    providerWindowExpired: parsed.data.provider_window_expired,
    notificationLogsUpdated: parsed.data.notification_logs_updated,
  };
}

export async function authorizeEmailDeliveryTransport(
  supabase: RpcClient,
  delivery: ClaimedEmailDelivery,
): Promise<z.infer<typeof rawTransportAuthorizationSchema>> {
  const { data, error } = await supabase.rpc(
    "authorize_email_delivery_transport",
    {
      p_delivery_id: delivery.deliveryId,
      p_lease_token: delivery.leaseToken,
    },
  );
  if (error) {
    throw new EmailDeliveryPersistenceError(
      "transport authorization",
      error.message,
    );
  }

  const parsed = rawTransportAuthorizationSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse("transport authorization");
  return parsed.data;
}

export async function completeEmailDelivery(
  supabase: RpcClient,
  delivery: ClaimedEmailDelivery,
  providerMessageId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("complete_email_delivery", {
    p_delivery_id: delivery.deliveryId,
    p_lease_token: delivery.leaseToken,
    p_provider_message_id: providerMessageId,
  });
  if (error) {
    throw new EmailDeliveryPersistenceError("completion", error.message);
  }
  if (data !== true) {
    throw new EmailDeliveryPersistenceError(
      "completion",
      "lease compare-and-set was rejected",
    );
  }
}

export async function recordEmailDeliveryFailure(
  supabase: RpcClient,
  delivery: ClaimedEmailDelivery,
  args: { errorCode: string; retryable: boolean },
): Promise<{ retryScheduled: boolean; nextAttemptAt: string | null }> {
  const { data, error } = await supabase.rpc("fail_email_delivery", {
    p_delivery_id: delivery.deliveryId,
    p_lease_token: delivery.leaseToken,
    p_error_code: args.errorCode,
    p_retryable: args.retryable,
  });
  if (error) {
    throw new EmailDeliveryPersistenceError("failure recording", error.message);
  }

  const parsed = rawFailureResultSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse("failure recording");
  if (!parsed.data.recorded) {
    throw new EmailDeliveryPersistenceError(
      "failure recording",
      parsed.data.reason ?? "lease compare-and-set was rejected",
    );
  }
  return {
    retryScheduled: parsed.data.retry_scheduled === true,
    nextAttemptAt: parsed.data.next_attempt_at ?? null,
  };
}

export async function suppressEmailDelivery(
  supabase: RpcClient,
  delivery: ClaimedEmailDelivery,
  reason: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("suppress_email_delivery", {
    p_delivery_id: delivery.deliveryId,
    p_lease_token: delivery.leaseToken,
    p_reason: reason,
  });
  if (error) {
    throw new EmailDeliveryPersistenceError("suppression", error.message);
  }
  if (data !== true) {
    throw new EmailDeliveryPersistenceError(
      "suppression",
      "lease compare-and-set was rejected",
    );
  }
}

function transportFailure(error: unknown): {
  errorCode: string;
  retryable: boolean;
} {
  if (error instanceof EmailSendError) {
    return {
      errorCode: error.providerCode ?? error.kind,
      retryable: error.retryable,
    };
  }
  if (error instanceof OutboundEmailConfigurationError) {
    return { errorCode: "outbound_email_misconfigured", retryable: false };
  }
  return { errorCode: "unexpected_transport_failure", retryable: false };
}

export type EmailDeliveryAttempt =
  | { status: "sent"; providerMessageId: string }
  | { status: "deferred"; reason: "provider_rate_window_full" }
  | {
      status: "skipped";
      reason: "outbound_email_disabled" | z.infer<typeof transportSuppressionReasonSchema>;
    }
  | {
      status: "failed";
      retryScheduled: boolean;
      nextAttemptAt: string | null;
      error: unknown;
    };

/**
 * Execute one already-leased exact request. A database-time CAS authorization
 * fails closed before transport when the lease or delivery window is unsafe.
 * Completion happens only after Resend confirms an id; a persistence failure
 * leaves the request queued for same-key replay inside the bounded window.
 */
export async function deliverClaimedEmail(
  supabase: RpcClient,
  delivery: ClaimedEmailDelivery,
): Promise<EmailDeliveryAttempt> {
  const authorization = await authorizeEmailDeliveryTransport(supabase, delivery);
  if (!authorization.authorized) {
    if (
      authorization.deferred === true &&
      authorization.reason === "provider_rate_window_full"
    ) {
      return { status: "deferred", reason: authorization.reason };
    }
    if (authorization.suppressed) {
      const reason = transportSuppressionReasonSchema.safeParse(
        authorization.reason,
      );
      if (reason.success) {
        return { status: "skipped", reason: reason.data };
      }
    }
    throw new EmailDeliveryPersistenceError(
      "transport authorization",
      authorization.reason,
    );
  }

  let result;
  try {
    result = await sendEmail({
      to: delivery.recipient,
      from: delivery.sender,
      replyTo: delivery.replyTo,
      subject: delivery.subject,
      html: delivery.html,
      idempotencyKey: delivery.idempotencyKey,
    });
  } catch (error) {
    const failure = transportFailure(error);
    const recorded = await recordEmailDeliveryFailure(supabase, delivery, failure);
    return {
      status: "failed",
      retryScheduled: recorded.retryScheduled,
      nextAttemptAt: recorded.nextAttemptAt,
      error,
    };
  }

  if (result.status === "skipped") {
    await suppressEmailDelivery(supabase, delivery, result.reason);
    return result;
  }

  await completeEmailDelivery(supabase, delivery, result.id);
  return { status: "sent", providerMessageId: result.id };
}
