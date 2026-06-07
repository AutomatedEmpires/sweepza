"use client";

import posthog from "posthog-js";

import type { AnalyticsProps } from "@/lib/analytics";
import { env } from "@/lib/env";

let initialized = false;

export function ensurePosthog(): void {
  if (initialized) return;

  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key || !host) {
    // Graceful no-op when env vars absent.
    initialized = true;
    return;
  }

  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    autocapture: false,
  });

  initialized = true;
}

export function capture(event: string, props: AnalyticsProps = {}): void {
  if (!initialized) ensurePosthog();
  if (!posthog.__loaded) return;

  posthog.capture(event, props);
}
