import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
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
        app: Boolean(
          env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        ),
        webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
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
