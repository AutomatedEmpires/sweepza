import { NextResponse } from "next/server";
import { isPaymentsEnabled } from "@/lib/billing/payment-gate";
import { isBillingConfigured } from "@/lib/billing/plans";
import {
  isOutboundEmailConfigured,
  isOutboundEmailEnabled,
} from "@/lib/email/outbound-gate";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const stripeConfigured = isBillingConfigured();
  const paymentsEnabled = isPaymentsEnabled();
  const outboundEmailConfigured = isOutboundEmailConfigured();
  const outboundEmailEnabled = isOutboundEmailEnabled();

  return NextResponse.json({
    ok:
      (!paymentsEnabled || stripeConfigured) &&
      (!outboundEmailEnabled || outboundEmailConfigured),
    timestamp: new Date().toISOString(),
    integrations: {
      appUrl: Boolean(env.NEXT_PUBLIC_APP_URL),
      supabase: {
        publicClient: Boolean(
          env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ),
        serviceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      },
      clerk: {
        app: Boolean(
          env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY,
        ),
        webhook: Boolean(env.CLERK_WEBHOOK_SECRET),
      },
      stripe: {
        configured: stripeConfigured,
        enabled: paymentsEnabled,
        ready: stripeConfigured && paymentsEnabled,
        app: Boolean(
          env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        ),
        webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
        prices: Boolean(env.STRIPE_PRICE_HOST_BASELINE),
      },
      email: {
        configured: outboundEmailConfigured,
        enabled: outboundEmailEnabled,
        ready: outboundEmailConfigured && outboundEmailEnabled,
      },
      posthog: Boolean(env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST),
      sentry: Boolean(
        env.NEXT_PUBLIC_SENTRY_DSN &&
          env.SENTRY_AUTH_TOKEN &&
          env.SENTRY_ORG &&
          env.SENTRY_PROJECT,
      ),
      githubWorker: Boolean(env.GITHUB_TOKEN),
      notionWorker: Boolean(env.NOTION_API_TOKEN),
    },
  });
}
