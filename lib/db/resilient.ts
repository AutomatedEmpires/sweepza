import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * Degrade a public read into its designed empty state instead of the error
 * boundary.
 *
 * The anonymous front doors (Today, Discover, Swipe, Winner Wall) are all
 * deliberately designed to read as "early, not broken" with zero inventory —
 * but before this helper, a data-layer failure replaced the entire page with
 * the generic error boundary. Empty was designed for; failure was not. Wrapping
 * the feed read makes the worst case (database unreachable) render the same
 * calm, fully-designed page as an empty catalog, while the failure itself is
 * reported to Sentry so operators see the degradation seekers don't.
 *
 * Use ONLY for public, read-only surfaces whose empty state is a designed
 * experience. Never wrap writes, auth-scoped reads, or the listing detail page
 * (a missing listing must 404, and a broken one must not silently vanish).
 */
export async function withPublicFallback<T>(
  read: Promise<T>,
  fallback: T,
  surface: string,
): Promise<T> {
  try {
    return await read;
  } catch (error) {
    Sentry.captureException(error, { tags: { degraded_surface: surface } });
    return fallback;
  }
}
