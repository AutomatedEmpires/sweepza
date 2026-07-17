import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import {
  SourceFetchError,
  type AdapterContext,
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

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&lsquo;": "‘",
  "&ldquo;": "“", "&rdquo;": "”", "&ndash;": "–", "&mdash;": "—",
  "&nbsp;": " ", "&hellip;": "…", "&trade;": "™", "&reg;": "®",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

function stripTags(value: string): string {
  const withoutBlocks = value.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1[^>]*>/gi,
    " ",
  );
  // Strip remaining tags repeatedly so overlapping/reconstructed "<...>"
  // sequences cannot survive a single pass.
  let previous: string;
  let stripped = withoutBlocks;
  do {
    previous = stripped;
    stripped = stripped.replace(/<[^>]*>/g, "");
  } while (stripped !== previous);
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
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
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : undefined;
}

/** The newest daily-listing path from the /new-sweepstakes hub, or null. */
export function parseNewestDailyPath(hubHtml: string): string | null {
  const m = hubHtml.match(/\/new-sweepstakes-\d+\.html/);
  return m ? m[0] : null;
}

/**
 * Parse a Sweeps Advantage daily-listing page into structured cards. Splits on
 * the per-listing container (`data-link_id`) and extracts the id, title, and
 * the labeled metadata fields as hints.
 */
export function parseSweepsAdvantageDaily(html: string): SweepsAdvantageCard[] {
  const parts = html.split(/data-link_id="/).slice(1);
  const cards: SweepsAdvantageCard[] = [];

  for (const part of parts) {
    const idMatch = part.match(/^(\d+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];

    const titleMatch = part.match(
      new RegExp(`href="/sweepstakes-${id}\\.html"[^>]*>([\\s\\S]*?)</a>`, "i"),
    );
    const title = titleMatch ? stripTags(titleMatch[1]) : "";
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
      description: descMatch ? stripTags(descMatch[1]) : undefined,
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
  async discover({ http, limit }: AdapterContext): Promise<DiscoveredLead[]> {
    // Source-level fetches. A 500/timeout/rate-limit here means THE SOURCE is
    // down, which is not the same fact as "no new sweeps" — collapsing both to
    // [] let the orchestrator record `ok`, reset consecutive_failures, and kept
    // the circuit breaker from ever opening on a real outage.
    const hub = await http.get(`${BASE}${HUB_PATH}`);
    if (hub.status === "not_modified") return []; // genuinely nothing new
    if (hub.status !== "ok") throw new SourceFetchError(hub.url, hub.failure, hub.message);

    // Not a fetch failure: the source answered, our parser found no daily link.
    // Left as a quiet result rather than an outage signal.
    const dailyPath = parseNewestDailyPath(hub.body);
    if (!dailyPath) return [];

    const daily = await http.get(`${BASE}${dailyPath}`);
    if (daily.status === "not_modified") return [];
    if (daily.status !== "ok") throw new SourceFetchError(daily.url, daily.failure, daily.message);

    const cards = parseSweepsAdvantageDaily(daily.body);

    const leads: DiscoveredLead[] = [];
    for (const card of cards.slice(0, limit)) {
      // The redirect is the only way to learn the official URL; a failed
      // resolve drops the lead rather than guessing at a destination.
      const resolved = await http.resolve(`${BASE}${card.redirectPath}`);
      if (resolved.status !== "ok") continue;
      const officialUrl = normalizeUrl(resolved.finalUrl);
      if (!officialUrl) continue;
      leads.push({
        officialUrl,
        sourceUrl: `${BASE}${card.detailPath}`,
        hint: { title: card.title, endDate: card.hintEndDate },
      });
    }
    return leads;
  },
};
