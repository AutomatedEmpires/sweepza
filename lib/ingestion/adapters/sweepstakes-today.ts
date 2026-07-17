import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import { stripHtmlToText } from "@/lib/ingestion/html-text";
import {
  SourceFetchError,
  type AdapterContext,
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
  const blocks = html.split(/<tr\b[^>]*class="[^"]*sweep-row/i).slice(1);

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
  const rules = html.match(/class="rules-link"[^>]*href="([^"]+)"/i)
    ?? html.match(/href="([^"]+)"[^>]*class="rules-link"/i);
  const entry = html.match(/class="enter-btn"[^>]*href="([^"]+)"/i)
    ?? html.match(/href="([^"]+)"[^>]*class="enter-btn"/i);

  for (const candidate of [rules?.[1], entry?.[1]]) {
    if (!candidate) continue;
    const normalized = normalizeUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export const sweepstakesTodayAdapter: SourceAdapter = {
  id: "sweepstakes_today",
  async discover({ http, limit }: AdapterContext): Promise<DiscoveredLead[]> {
    // Source-level fetch: a classified failure here is an outage, not a quiet
    // day, and must reach the circuit breaker rather than becoming [].
    const index = await http.get(`${BASE}${INDEX_PATH}`);
    if (index.status === "not_modified") return [];
    if (index.status !== "ok") {
      throw new SourceFetchError(index.url, index.failure, index.message);
    }

    const rows = parseSweepstakesTodayIndex(index.body);
    const leads: DiscoveredLead[] = [];

    for (const row of rows.slice(0, limit)) {
      const detail = await http.get(`${BASE}${row.detailPath}`);
      if (detail.status !== "ok") continue;

      const officialUrl = parseSweepstakesTodayOfficialUrl(detail.body);
      if (!officialUrl) continue;

      leads.push({
        officialUrl,
        sourceUrl: `${BASE}${row.detailPath}`,
        hint: { title: row.title, endDate: row.hintEndDate },
      });
    }

    return leads;
  },
};
