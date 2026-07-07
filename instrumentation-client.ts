import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

// Client-side Sentry init — replaces the deprecated sentry.client.config.ts.
if (env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

// Instruments App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
