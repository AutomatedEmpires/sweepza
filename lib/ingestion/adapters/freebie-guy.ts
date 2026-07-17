import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import { decodeHtmlEntities, stripHtmlToText } from "@/lib/ingestion/html-text";
import { isRetryable, type FetchFailureClass } from "@/lib/ingestion/http";
import {
  SourceFetchError,
  type AdapterContext,
  type DiscoveredLead,
  type SourceAdapter,
} from "@/lib/ingestion/source";

// Tier-1 discovery adapter for The Freebie Guy (build priority #2).
//
// The third structural shape in the platform, and the one that tests its
// judgment: this source is a general freebies/deals blog where sweepstakes are
// a SUBSET. An adapter that treated every post as a sweepstakes would flood the
// review queue with free samples and coupon posts, so filtering is the adapter's
// real job — and filtering is a place to be conservative, since a missed
// sweepstakes costs one listing while a mis-ingested coupon costs trust.
//
// It also carries the strictest crawl budget in the registry (robots asks for a
// 10-second delay), which is why it takes the archive's own links rather than
// paginating: fewer requests, same yield.

const HOST = "https://thefreebieguy.com";
const SOURCE_HOST = "thefreebieguy.com";
const ARCHIVE_PATH = "/category/sweepstakes";

export interface FreebieGuyPost {
  url: string;
  title: string;
  publishedOn?: string;
}

/** True when a normalized URL's host is the blog itself (exact or subdomain). */
function isSourceHost(normalizedUrl: string): boolean {
  let host: string;
  try {
    host = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  // Exact host or a real subdomain — never a lookalike like
  // "thefreebieguy.com.evil.example" (which a startsWith check would misclassify).
  return host === SOURCE_HOST || host.endsWith(`.${SOURCE_HOST}`);
}

/**
 * Is this post plausibly a sweepstakes? The blog mixes freebies, coupons, and
 * sweepstakes, and only the sweepstakes belong here. Requires positive evidence
 * (a sweepstakes/giveaway/enter-to-win signal) rather than merely the absence
 * of freebie words, because "no evidence it's a freebie" is not evidence that
 * it IS a sweepstakes.
 */
export function looksLikeSweepstakes(post: { url: string; title: string }): boolean {
  const haystack = `${post.url} ${post.title}`.toLowerCase();
  if (/\/freebies?\/|free sample|free stuff|coupon|printable/.test(haystack)) {
    // An explicit sweepstakes path still wins over a freebie-sounding title —
    // "Free Coffee Sweepstakes" is a sweepstakes.
    if (!/\/sweepstakes\//.test(haystack)) return false;
  }
  return /\/sweepstakes\/|sweepstake|giveaway|enter to win|win a /.test(haystack);
}

/** True when the blogger has marked the giveaway as finished. */
export function isClosedPost(html: string): boolean {
  return /this (giveaway|sweepstakes) (has ended|is over|is closed)|giveaway has ended|winner has been (chosen|selected)|congratulations to our winner/i.test(
    html,
  );
}

/** Parse the category archive into candidate posts. */
export function parseFreebieGuyArchive(html: string): FreebieGuyPost[] {
  const posts: FreebieGuyPost[] = [];
  const blocks = html.split(/<article\b/i).slice(1);

  for (const block of blocks) {
    const linkMatch = block.match(
      /class="entry-title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!linkMatch) continue;

    // hrefs are HTML-encoded — `&amp;` is the normal serialization of `&`, and
    // normalizing it raw renames query parameters (`&amp;b=2` → `amp;b`).
    const url = normalizeUrl(decodeHtmlEntities(linkMatch[1]));
    const title = stripHtmlToText(linkMatch[2]);
    if (!url || !title) continue;

    const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/i);
    posts.push({
      url,
      title,
      publishedOn: timeMatch ? timeMatch[1].slice(0, 10) : undefined,
    });
  }

  return posts;
}

/**
 * Extract the sponsor's official URL from a post body. The blog links out with
 * rel="nofollow sponsored", and the first off-site link in the content is the
 * entry destination; links back to the blog itself are navigation, not leads.
 */
export function parseFreebieGuyOfficialUrl(html: string): string | null {
  const content = html.match(/class="entry-content"[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? html;
  const hrefs = [...content.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);

  for (const href of hrefs) {
    const normalized = normalizeUrl(decodeHtmlEntities(href));
    if (!normalized) continue;
    // Skip links back to the blog itself; compare by parsed host, not string
    // prefix, so a lookalike domain can't masquerade as internal (or vice versa).
    if (isSourceHost(normalized)) continue;
    return normalized;
  }
  return null;
}

export const freebieGuyAdapter: SourceAdapter = {
  id: "freebie_guy",
  async discover({ http, limit }: AdapterContext): Promise<DiscoveredLead[]> {
    // Source-level fetch: a classified failure here is an outage, not a quiet
    // day, and must reach the circuit breaker rather than becoming [].
    const archive = await http.get(`${HOST}${ARCHIVE_PATH}`);
    if (archive.status === "not_modified") return [];
    if (archive.status !== "ok") {
      throw new SourceFetchError(archive.url, archive.failure, archive.message);
    }

    const posts = parseFreebieGuyArchive(archive.body).filter(looksLikeSweepstakes);
    const leads: DiscoveredLead[] = [];

    // The archive answering does not prove the site is healthy. If every detail
    // request then fails transiently, returning [] would report a quiet day
    // while the source is down — the same defect as the archive fetch, one level
    // in. Isolated 404s stay isolated: a single removed post is a fact about
    // that post, not about the source.
    let attempted = 0;
    let answered = 0;
    let transientFailures = 0;
    let lastFailure: { url: string; failure: FetchFailureClass; message: string } | null = null;

    for (const post of posts.slice(0, limit)) {
      attempted += 1;
      const detail = await http.get(post.url);

      if (detail.status === "not_modified") {
        answered += 1; // the source responded; nothing changed
        continue;
      }
      if (detail.status !== "ok") {
        if (isRetryable(detail.failure)) {
          transientFailures += 1;
          lastFailure = { url: detail.url, failure: detail.failure, message: detail.message };
        } else {
          answered += 1; // a 404/410 is a real answer about that post
        }
        continue;
      }
      answered += 1;

      // A closed giveaway is a correct discovery outcome, not a failure: skip it
      // quietly rather than sending an already-over sweepstakes to review.
      if (isClosedPost(detail.body)) continue;

      const officialUrl = parseFreebieGuyOfficialUrl(detail.body);
      if (!officialUrl) continue;

      leads.push({
        officialUrl,
        sourceUrl: post.url,
        hint: { title: post.title },
      });
    }

    // Every detail we tried failed transiently and nothing answered: that is an
    // outage, and it must reach the circuit breaker rather than look like "no
    // new sweeps".
    if (attempted > 0 && answered === 0 && transientFailures === attempted && lastFailure) {
      throw new SourceFetchError(
        lastFailure.url,
        lastFailure.failure,
        `all ${attempted} detail request(s) failed transiently — ${lastFailure.message}`,
      );
    }

    return leads;
  },
};
