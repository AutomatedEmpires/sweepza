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
import type { EntryFrequency } from "@/lib/db/enums";

// Tier-1 discovery adapter for Sweepstakes Advantage (build priority #1 — 200+
// structured new listings/day, permissive robots). It reads *links*, not
// content: each listing's detail link redirects (via /go.php?id=<id>) straight
// to the sponsor's official page, which the pipeline then fetches and verifies
// as the source of truth. The daily-page metadata is captured only as untrusted
// hints for prioritization — never published.
//
// The parsers are pure and unit-tested against fixtures; the adapter is the
// thin shell around them, and it fetches exclusively through the policy client
// handed to it in AdapterContext.

const BASE = "https://www.sweepsadvantage.com";
const HUB_PATH = "/new-sweepstakes";

export interface SweepsAdvantageCard {
  sourceId: string;
  /** The SA redirect that resolves to the official sponsor URL. */
  redirectPath: string;
  detailPath: string;
  title: string;
  description?: string;
  hintEndDate?: string;
  hintFrequency?: EntryFrequency;
  hintValue?: number;
  hintRestrictions?: string;
}

/** Sweeps Advantage prints dates as MM-DD-YYYY; return YYYY-MM-DD. */
function saDateToIso(value: string): string | undefined {
  const m = value.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

function frequencyFromLimit(limit: string): EntryFrequency | undefined {
  const t = limit.toLowerCase();
  if (/instant/.test(t)) return "instant_win";
  if (/daily|per day|each day/.test(t)) return "daily";
  if (/weekly|per week/.test(t)) return "weekly";
  if (/monthly|per month/.test(t)) return "monthly";
  if (/one[-\s]?time|single|once|1 entry|one entry/.test(t)) return "one_time";
  return undefined;
}

function moneyFromValue(value: string): number | undefined {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function field(cardHtml: string, label: string): string | undefined {
  const re = new RegExp(`<strong>\\s*${label}\\s*:</strong>([^<]*)`, "i");
  const m = cardHtml.match(re);
  return m ? decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim() : undefined;
}

/** The newest daily-listing path from the /new-sweepstakes hub, or null. */
export function parseNewestDailyPath(hubHtml: string): string | null {
  const m = protectQuotedTagDelimiters(hubHtml).match(/\/new-sweepstakes-\d+\.html/);
  return m ? m[0] : null;
}

/**
 * Parse a Sweeps Advantage daily-listing page into structured cards. Splits on
 * the per-listing container (`data-link_id`) and extracts the id, title, and
 * the labeled metadata fields as hints.
 */
export function parseSweepsAdvantageDaily(html: string): SweepsAdvantageCard[] {
  const parts = protectQuotedTagDelimiters(html).split(/data-link_id="/).slice(1);
  const cards: SweepsAdvantageCard[] = [];

  for (const part of parts) {
    const idMatch = part.match(/^(\d+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];

    const titleMatch = part.match(
      new RegExp(`href="/sweepstakes-${id}\\.html"[^>]*>([\\s\\S]*?)</a>`, "i"),
    );
    const title = titleMatch ? stripHtmlToText(titleMatch[1]) : "";
    if (!title) continue;

    const descMatch = part.match(/class="sweepstake-description"[^>]*>([\s\S]*?)<\/p>/i);
    const limit = field(part, "Limit");
    const value = field(part, "Value");
    const expires = field(part, "Expires");

    cards.push({
      sourceId: id,
      redirectPath: `/go.php?id=${id}`,
      detailPath: `/sweepstakes-${id}.html`,
      title,
      description: descMatch ? stripHtmlToText(descMatch[1]) : undefined,
      hintEndDate: expires ? saDateToIso(expires) : undefined,
      hintFrequency: limit ? frequencyFromLimit(limit) : undefined,
      hintValue: value ? moneyFromValue(value) : undefined,
      hintRestrictions: field(part, "Restrictions"),
    });
  }

  return cards;
}

export const sweepsAdvantageAdapter: SourceAdapter = {
  id: "sweeps_advantage",
  async discover({ http, workQueue, limit }: AdapterContext): Promise<DiscoveredLead[]> {
    // Source-level fetches. A 500/timeout/rate-limit here means THE SOURCE is
    // down, which is not the same fact as "no new sweeps" — collapsing both to
    // [] let the orchestrator record `ok`, reset consecutive_failures, and kept
    // the circuit breaker from ever opening on a real outage.
    const hub = await http.get(`${BASE}${HUB_PATH}`);
    if (hub.status !== "ok" && hub.status !== "not_modified") {
      throw new SourceFetchError(hub.url, hub.failure, hub.message);
    }

    // The source answered, but its markup no longer contains the daily link this
    // adapter is built around. That is not a quiet day — it means the page
    // changed shape or is serving something unexpected, and returning [] would
    // hide a broken parser behind "no new sweeps" indefinitely. Classified as
    // `empty_body`: we got a response with nothing usable in it.
    if (hub.status === "ok") {
      const dailyPath = parseNewestDailyPath(hub.body);
      if (!dailyPath) {
        throw new SourceFetchError(
          `${BASE}${HUB_PATH}`,
          "empty_body",
          "the hub returned no daily-sweepstakes link — the page shape changed or the parser is stale",
        );
      }

      const daily = await http.get(`${BASE}${dailyPath}`);
      if (daily.status !== "ok" && daily.status !== "not_modified") {
        throw new SourceFetchError(daily.url, daily.failure, daily.message);
      }
      if (daily.status === "ok") {
        const cards = parseSweepsAdvantageDaily(daily.body);
        if (cards.length === 0) {
          throw new SourceFetchError(
            daily.url,
            "empty_body",
            "the daily page returned no parseable sweepstakes cards",
          );
        }
        await workQueue.enqueue(cards.map((card): DiscoveryWorkItem => ({
          key: card.sourceId,
          payload: { ...card },
        })));
        // Every child is durable before this validator can produce a 304.
        await http.commitFetchState(`${BASE}${dailyPath}`, daily);
      }
      // Deliberately do not commit the hub validator. A hub can remain
      // unchanged while the current daily page gains cards; fetching the hub
      // body is how we retain the daily URL needed to revalidate that page.
    }

    const leads: DiscoveredLead[] = [];
    for (const item of await workQueue.take(limit)) {
      const card = item.payload as unknown as SweepsAdvantageCard;
      if (!card.sourceId || !card.redirectPath || !card.detailPath || !card.title) {
        await workQueue.complete(item.key);
        continue;
      }
      // The redirect is the only way to learn the official URL; a failed
      // resolve drops the lead rather than guessing at a destination.
      const resolved = await http.resolve(`${BASE}${card.redirectPath}`);
      if (resolved.status !== "ok") {
        if (resolved.status === "failed" && resolved.failure === "not_found") {
          await workQueue.complete(item.key);
        } else {
          await workQueue.defer(item.key);
        }
        continue;
      }
      const officialUrl = normalizeUrl(resolved.finalUrl);
      if (officialUrl) {
        leads.push({
          officialUrl,
          sourceUrl: `${BASE}${card.detailPath}`,
          hint: { title: card.title, endDate: card.hintEndDate },
          discoveryWorkKey: item.key,
        });
      } else {
        await workQueue.complete(item.key);
      }
    }
    return leads;
  },
};
