import * as Sentry from "@sentry/nextjs";

// Next.js instrumentation hook — Sentry server/edge init lives here (the
// standalone sentry.*.config.ts pattern is deprecated as of SDK v9).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors from nested React Server Components.
export const onRequestError = Sentry.captureRequestError;
