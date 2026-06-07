// Analytics aligned to "Sweepza — Analytics Event Dictionary [CANONICAL]".
// Event names use object_action snake_case and MUST match the dictionary.
// Keep PII out of properties (never send emails/photos).

import { capture } from "@/lib/posthog/client";

export type AnalyticsEvent =
  | "listing_viewed"
  | "listing_saved"
  | "listing_enter_clicked"
  | "listing_marked_entered"
  | "listing_skipped"
  | "listing_shared"
  | "discover_feed_loaded"
  | "filter_applied"
  | "winner_post_created"
  | "winner_post_published"
  | "winner_post_reacted"
  | "winner_submission_started"
  | "winner_submission_completed"
  | "winner_submission_failed";

export type AnalyticsValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[];

export type AnalyticsProps = Record<string, AnalyticsValue>;

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${event}`, props);
  }
  capture(event, props);
}
