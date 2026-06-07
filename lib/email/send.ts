import "server-only";

import { env } from "@/lib/env";

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Sweepza <hello@sweepza.com>";

/**
 * Send a transactional email via the Resend REST API using fetch (no SDK).
 *
 * - Graceful no-op (console.warn) when RESEND_API_KEY is not configured, so
 *   preview/dev environments without secrets do not throw.
 * - Throws on a non-2xx response with the status and body for observability.
 */
export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email] RESEND_API_KEY not set; skipping email to ${to} ("${subject}")`,
    );
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    throw new Error(
      `Resend email failed with status ${response.status}: ${body}`,
    );
  }
}
