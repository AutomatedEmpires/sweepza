/**
 * Reduce a route value to the non-identifying pathname used for page-view
 * analytics. Query strings can contain free-form search text or other user
 * input and must never be copied into PostHog.
 */
export function analyticsPathname(value: string): string {
  const suffixStart = value.search(/[?#]/);
  const pathname = suffixStart === -1 ? value : value.slice(0, suffixStart);
  return pathname || "/";
}
