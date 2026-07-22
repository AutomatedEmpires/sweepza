import "server-only";

import {
  isOutboundEmailEnabled,
  isSweepzaOwnedEmailIdentity,
  OutboundEmailConfigurationError,
  requireOutboundEmailConfiguration,
} from "@/lib/email/outbound-gate";
import { env } from "@/lib/env";

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /**
   * Stable provider request key. Resend retains keys for 24 hours and replays
   * the original response instead of delivering the email again.
   */
  idempotencyKey?: string;
  /** Exact sender identity captured with a durable delivery. Must accompany replyTo. */
  from?: string;
  /** Exact reply identity captured with a durable delivery. Must accompany from. */
  replyTo?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const RESEND_TIMEOUT_MS = 20_000;

// Provider-controlled strings never cross the transport boundary unless they
// match a known, non-sensitive machine code.
const SAFE_RESEND_ERROR_CODES = new Set([
  "application_error",
  "concurrent_idempotent_requests",
  "daily_quota_exceeded",
  "internal_server_error",
  "invalid_access",
  "invalid_api_key",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_idempotent_request",
  "invalid_parameter",
  "invalid_region",
  "method_not_allowed",
  "missing_required_field",
  "monthly_quota_exceeded",
  "not_found",
  "rate_limit_exceeded",
  "request_timeout",
  "restricted_api_key",
  "security_error",
  "service_unavailable",
  "validation_error",
]);

export type EmailSendResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: "outbound_email_disabled" };

export type EmailSendErrorKind =
  | "invalid_idempotency_key"
  | "invalid_sender_override"
  | "network"
  | "timeout"
  | "provider_http"
  | "invalid_provider_response";

type EmailSendErrorDetails = {
  kind: EmailSendErrorKind;
  retryable: boolean;
  status?: number;
  providerCode?: string;
};

/** A transport failure whose retry safety can be consumed by an outbox worker. */
export class EmailSendError extends Error {
  readonly kind: EmailSendErrorKind;
  readonly retryable: boolean;
  readonly status: number | null;
  readonly providerCode: string | null;

  constructor(message: string, details: EmailSendErrorDetails) {
    super(message);
    this.name = "EmailSendError";
    this.kind = details.kind;
    this.retryable = details.retryable;
    this.status = details.status ?? null;
    this.providerCode = details.providerCode ?? null;
  }
}

function validateIdempotencyKey(key: unknown): string | undefined {
  if (key === undefined) return undefined;

  if (
    typeof key !== "string" ||
    key.length > 256 ||
    !/^[\x21-\x7e]+$/.test(key)
  ) {
    throw new EmailSendError(
      "Resend idempotency key must be 1 to 256 visible ASCII characters.",
      { kind: "invalid_idempotency_key", retryable: false },
    );
  }

  return key;
}

function resolveConfiguration(
  fromOverride: unknown,
  replyToOverride: unknown,
  requireOverrides: boolean,
) {
  const hasFromOverride = fromOverride !== undefined;
  const hasReplyToOverride = replyToOverride !== undefined;

  if (!requireOverrides && !hasFromOverride && !hasReplyToOverride) {
    return requireOutboundEmailConfiguration();
  }

  if (
    !hasFromOverride ||
    !hasReplyToOverride ||
    typeof fromOverride !== "string" ||
    typeof replyToOverride !== "string" ||
    !isSweepzaOwnedEmailIdentity(fromOverride) ||
    !isSweepzaOwnedEmailIdentity(replyToOverride)
  ) {
    throw new EmailSendError(
      "Idempotent or overridden email sends require both From and Reply-To to be explicit Sweepza-owned identities.",
      { kind: "invalid_sender_override", retryable: false },
    );
  }

  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new OutboundEmailConfigurationError(
      "Outbound email requires a Resend API key.",
    );
  }

  return { apiKey, from: fromOverride, replyTo: replyToOverride };
}

function providerErrorCode(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "name" in parsed &&
      typeof parsed.name === "string" &&
      SAFE_RESEND_ERROR_CODES.has(parsed.name)
    ) {
      return parsed.name;
    }
  } catch {
    // Error bodies are not guaranteed to be JSON.
  }

  return undefined;
}

function isTimeoutFailure(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TimeoutError"
  );
}

function isRetryableProviderFailure(
  status: number,
  code: string | undefined,
  hasIdempotencyKey: boolean,
) {
  if (!hasIdempotencyKey) return false;
  // With a frozen keyed body, an unreadable/unknown 409 is ambiguous: the
  // original request may still be completing. Only Resend's explicit payload
  // mismatch proves that replay is unsafe.
  if (status === 409) return code !== "invalid_idempotent_request";
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Send a transactional email via the Resend REST API using fetch (no SDK).
 *
 * - The checked-in activation gate is evaluated before configuration or fetch.
 * - Enabled-but-incomplete configuration throws instead of pretending to send.
 * - Provider failures expose only sanitized status/code metadata.
 */
export async function sendEmail({
  to,
  subject,
  html,
  idempotencyKey,
  from: fromOverride,
  replyTo: replyToOverride,
}: SendEmailArgs): Promise<EmailSendResult> {
  if (!isOutboundEmailEnabled()) {
    return { status: "skipped", reason: "outbound_email_disabled" };
  }

  const validatedIdempotencyKey = validateIdempotencyKey(idempotencyKey);
  const hasIdempotencyKey = validatedIdempotencyKey !== undefined;
  const { apiKey, from, replyTo } = resolveConfiguration(
    fromOverride,
    replyToOverride,
    hasIdempotencyKey,
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (validatedIdempotencyKey !== undefined) {
    headers["Idempotency-Key"] = validatedIdempotencyKey;
  }

  const timeoutSignal = AbortSignal.timeout(RESEND_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ from, reply_to: replyTo, to, subject, html }),
      signal: timeoutSignal,
    });
  } catch (error) {
    const timedOut = isTimeoutFailure(error, timeoutSignal);
    throw new EmailSendError(
      timedOut
        ? "Resend email request timed out."
        : "Resend email request failed before a response was received.",
      {
        kind: timedOut ? "timeout" : "network",
        retryable: hasIdempotencyKey,
      },
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    const code = providerErrorCode(body);
    throw new EmailSendError(
      `Resend email failed with status ${response.status}${code ? ` (${code})` : ""}.`,
      {
        kind: "provider_http",
        retryable: isRetryableProviderFailure(
          response.status,
          code,
          hasIdempotencyKey,
        ),
        status: response.status,
        providerCode: code,
      },
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    const timedOut = isTimeoutFailure(error, timeoutSignal);
    throw new EmailSendError(
      timedOut
        ? "Resend email request timed out while reading its response."
        : "Could not read the Resend success response.",
      {
        kind: timedOut ? "timeout" : "network",
        retryable: hasIdempotencyKey,
        status: response.status,
      },
    );
  }

  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { status: "sent", id: parsed.id };
    }
  } catch {
    // Fall through to the structured provider-response failure below.
  }

  throw new EmailSendError(
    "Resend success response did not contain an email id.",
    {
      kind: "invalid_provider_response",
      // A repeated request is safe only when Resend can match the same key.
      retryable: validatedIdempotencyKey !== undefined,
      status: response.status,
    },
  );
}
