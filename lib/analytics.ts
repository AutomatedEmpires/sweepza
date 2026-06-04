// Analytics stub aligned to "Sweepza — Analytics Event Dictionary [CANONICAL]".
// Event names use object_action snake_case and MUST match the dictionary.
// No transport yet — Lane H wires PostHog. Keep PII out of properties
// (never send emails/photos).

export type AnalyticsEvent =
  | "listing_viewed"
  | "listing_saved"
  | "listing_enter_clicked"
  | "listing_marked_entered"
  | "listing_skipped"
  | "listing_shared"
  | "discover_feed_loaded"
  | "filter_applied";

export type AnalyticsValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[];

export type AnalyticsProps = Record<string, AnalyticsValue>;

/**
 * Records a product event. Today this only logs in development; Lane H will
 * forward to PostHog. Base props (role, session_id) are added once auth exists.
 */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${event}`, props);
  }
  // Lane H: posthog.capture(event, props)
}
