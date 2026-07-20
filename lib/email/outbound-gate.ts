import { env } from "@/lib/env";

export type OutboundEmailConfiguration = {
  apiKey: string;
  from: string;
  replyTo: string;
};

export class OutboundEmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundEmailConfigurationError";
  }
}

export function isOutboundEmailEnabled(): boolean {
  return env.OUTBOUND_EMAIL_ENABLED === "true";
}

function extractMailbox(identity: string): string | null {
  const trimmed = identity.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;

  const bare = trimmed.match(/^([^\s<>@]+@[^\s<>@]+)$/);
  const named = trimmed.match(/^[^<>]+\s<([^\s<>@]+@[^\s<>@]+)>$/);
  return (bare?.[1] ?? named?.[1] ?? null)?.toLowerCase() ?? null;
}

export function isSweepzaOwnedEmailIdentity(identity: string): boolean {
  const mailbox = extractMailbox(identity);
  if (!mailbox) return false;
  const domain = mailbox.slice(mailbox.lastIndexOf("@") + 1);
  return domain === "sweepza.com" || domain.endsWith(".sweepza.com");
}

export function getOutboundEmailConfiguration(): OutboundEmailConfiguration | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  const replyTo = env.RESEND_REPLY_TO_EMAIL?.trim();

  if (
    !apiKey ||
    !from ||
    !replyTo ||
    !isSweepzaOwnedEmailIdentity(from) ||
    !isSweepzaOwnedEmailIdentity(replyTo)
  ) {
    return null;
  }

  return { apiKey, from, replyTo };
}

export function isOutboundEmailConfigured(): boolean {
  return getOutboundEmailConfiguration() !== null;
}

export function requireOutboundEmailConfiguration(): OutboundEmailConfiguration {
  const configuration = getOutboundEmailConfiguration();
  if (!configuration) {
    throw new OutboundEmailConfigurationError(
      "Outbound email requires a Resend key plus explicit Sweepza-owned From and Reply-To identities.",
    );
  }
  return configuration;
}
