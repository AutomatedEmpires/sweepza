import "server-only";

import {
  isOutboundEmailEnabled,
  requireOutboundEmailConfiguration,
} from "@/lib/email/outbound-gate";

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailSendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "outbound_email_disabled" };

/**
 * Send a transactional email via the Resend REST API using fetch (no SDK).
 *
 * - The checked-in activation gate is evaluated before configuration or fetch.
 * - Enabled-but-incomplete configuration throws instead of pretending to send.
 * - Throws on a non-2xx response with the status and body for observability.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailArgs): Promise<EmailSendResult> {
  if (!isOutboundEmailEnabled()) {
    return { status: "skipped", reason: "outbound_email_disabled" };
  }

  const { apiKey, from, replyTo } = requireOutboundEmailConfiguration();

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, reply_to: replyTo, to, subject, html }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    throw new Error(`Resend email failed with status ${response.status}: ${body}`);
  }

  return { status: "sent" };
}
