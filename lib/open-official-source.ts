type OpenEntryTab = () => Window | null;

export const OFFICIAL_SOURCE_BLOCKED_MESSAGE =
  "Your browser blocked the official entry page. Allow pop-ups and try again.";

/**
 * Opens an untrusted official-source URL without retaining access to Sweepza.
 * Returning false lets callers keep entry state unchanged when a browser
 * blocks the new tab or navigation fails.
 */
export function openOfficialSource(
  url: string,
  openEntryTab?: OpenEntryTab,
): boolean {
  if (!openEntryTab && typeof window === "undefined") return false;

  const entryTab = openEntryTab
    ? openEntryTab()
    : window.open("about:blank", "_blank");
  if (!entryTab) return false;

  try {
    entryTab.opener = null;
    entryTab.document.title = "Opening official entry…";
    const referrerPolicy = entryTab.document.createElement("meta");
    referrerPolicy.name = "referrer";
    referrerPolicy.content = "no-referrer";
    entryTab.document.head.append(referrerPolicy);
    entryTab.location.replace(url);
    return true;
  } catch {
    entryTab.close();
    return false;
  }
}
