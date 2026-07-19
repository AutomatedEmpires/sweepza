import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import {
  decodeHtmlEntities,
  protectQuotedTagDelimiters,
  stripHtmlToText,
} from "@/lib/ingestion/html-text";
import {
  SourceFetchError,
  type AdapterContext,
  type DiscoveryWorkItem,
  type DiscoveredLead,
  type SourceAdapter,
} from "@/lib/ingestion/source";

// Tier-1 discovery adapter for Sweepstakes Today (build priority #3).
//
// Structurally different from Sweeps Advantage in a way that exercises the
// platform rather than repeating it: there is no redirect endpoint, so the
// official URL must be read out of each detail page's own markup, and the
// source serves no validators (supportsConditionalRequests: false), so every
// pass is a full fetch bounded only by the request budget.
//
// Parsers are pure and fixture-tested; the adapter never calls fetch directly.

const BASE = "https://www.sweepstakestoday.com";
const INDEX_PATH = "/listings";

export interface SweepstakesTodayRow {
  detailPath: string;
  title: string;
  hintEndDate?: string;
  hintFrequency?: string;
}

/**
 * Parse the listings index into rows. Each row must yield a detail link; a row
 * without one is skipped rather than guessed at, because a fabricated path
 * would send us fetching pages that were never advertised.
 */
export function parseSweepstakesTodayIndex(html: string): SweepstakesTodayRow[] {
  const rows: SweepstakesTodayRow[] = [];
  const blocks = protectQuotedTagDelimiters(html)
    .split(/<tr\b[^>]*class="[^"]*sweep-row/i)
    .slice(1);

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/sweepstakes\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const detailPath = linkMatch[1];
    const title = stripHtmlToText(linkMatch[2]);
    if (!title) continue;

    const endMatch = block.match(/Ends:\s*(\d{4}-\d{2}-\d{2})/i);
    const freqMatch = block.match(/class="sweep-freq"[^>]*>([\s\S]*?)<\/td>/i);

    rows.push({
      detailPath,
      title,
      hintEndDate: endMatch ? endMatch[1] : undefined,
      hintFrequency: freqMatch ? stripHtmlToText(freqMatch[1]) : undefined,
    });
  }

  return rows;
}

/**
 * Pull the sponsor's official URL out of a detail page. Prefers the rules link
 * over the entry button: rules pages are the stabler identity and the entry
 * button is more often a tracking wrapper. Returns null when neither is a real
 * absolute URL — `href="#"` is a broken listing, and saying so is the honest
 * outcome.
 */
export function parseSweepstakesTodayOfficialUrl(html: string): string | null {
  const safeHtml = protectQuotedTagDelimiters(html);
  const rules = safeHtml.match(/class="rules-link"[^>]*href="([^"]+)"/i)
    ?? safeHtml.match(/href="([^"]+)"[^>]*class="rules-link"/i);
  const entry = safeHtml.match(/class="enter-btn"[^>]*href="([^"]+)"/i)
    ?? safeHtml.match(/href="([^"]+)"[^>]*class="enter-btn"/i);

  for (const candidate of [rules?.[1], entry?.[1]]) {
    if (!candidate) continue;
    // An href is HTML-encoded: `?a=1&amp;b=2` is the NORMAL serialization of
    // `?a=1&b=2`. Handing that to normalizeUrl silently renames the parameter
    // to `amp;b`, so the lead's identity — and its dedup key — is wrong.
    const normalized = normalizeUrl(decodeHtmlEntities(candidate));
    if (normalized) return normalized;
  }
  return null;
}

export const sweepstakesTodayAdapter: SourceAdapter = {
  id: "sweepstakes_today",
  async discover({ http, workQueue, limit }: AdapterContext): Promise<DiscoveredLead[]> {
    // Source-level fetch: a classified failure here is an outage, not a quiet
    // day, and must reach the circuit breaker rather than becoming [].
    const index = await http.get(`${BASE}${INDEX_PATH}`);
    if (index.status === "failed") {
      throw new SourceFetchError(index.url, index.failure, index.message);
    }

    let rows: SweepstakesTodayRow[] = [];
    if (index.status === "ok") {
      rows = parseSweepstakesTodayIndex(index.body);
      if (rows.length === 0) {
        // The source has an explicit empty-state marker. Any other 200 with no
        // rows is parser/layout drift and must reach source health telemetry.
        if (!/\bno sweepstakes today\b/i.test(stripHtmlToText(index.body))) {
          throw new SourceFetchError(
            index.url,
            "empty_body",
            "the listings page contained neither sweep rows nor the known empty-state marker",
          );
        }
      }
    }
    // A 304 (if a transport supplies one despite this descriptor's current
    // policy) means no new children, never "discard the durable backlog".
    await workQueue.enqueue(rows.map((row): DiscoveryWorkItem => ({
      key: row.detailPath,
      payload: { ...row },
    })));
    const leads: DiscoveredLead[] = [];

    for (const item of await workQueue.take(limit)) {
      const row = item.payload as unknown as SweepstakesTodayRow;
      if (!row.detailPath || !row.title) {
        await workQueue.complete(item.key);
        continue;
      }
      const detail = await http.get(`${BASE}${row.detailPath}`);
      if (detail.status === "not_modified") {
        await workQueue.complete(item.key);
        continue;
      }
      if (detail.status !== "ok") {
        if (detail.failure === "not_found") await workQueue.complete(item.key);
        else await workQueue.defer(item.key);
        continue;
      }

      const officialUrl = parseSweepstakesTodayOfficialUrl(detail.body);
      if (!officialUrl) {
        await workQueue.defer(item.key);
        continue;
      }

      leads.push({
        officialUrl,
        sourceUrl: `${BASE}${row.detailPath}`,
        hint: { title: row.title, endDate: row.hintEndDate },
        discoveryWorkKey: item.key,
      });
    }

    return leads;
  },
};
