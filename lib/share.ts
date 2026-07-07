// Client-side share with graceful degradation: native share sheet where the
// Web Share API exists (mobile), clipboard copy elsewhere (desktop). Callers
// surface the returned outcome (e.g. a "Link copied" flash for "copied").

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

export async function shareLink(args: {
  title: string;
  url: string;
  text?: string;
}): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: args.title, text: args.text, url: args.url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "dismissed";
      }
      // Fall through to clipboard on NotAllowedError and similar.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(args.url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}

export function listingShareUrl(slug: string): string {
  const path = `/sweeps/${slug}`;
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
