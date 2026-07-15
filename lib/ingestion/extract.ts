import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { stableHash } from "@/lib/ingestion/fingerprint";
import type { RawExtraction } from "@/lib/ingestion/mapper";

// Tier-2 extraction — read the sponsor's OFFICIAL page and turn it into the
// loose RawExtraction the mapper/verifier already understand. Facts (prize,
// odds, dates, eligibility) must come from the page; title/description are
// rewritten in a neutral house voice for SEO. The model is instructed to null
// out anything it can't find rather than invent it.

const MAX_PAGE_CHARS = 14_000;
const USER_AGENT = "Mozilla/5.0 (compatible; SweepzaBot/0.1; +https://sweepza.com/bot)";
const DEFAULT_MODEL = "claude-opus-4-8";

/**
 * Reduce fetched HTML to readable text for the extractor: drop scripts/styles/
 * head, strip tags, decode common entities, collapse whitespace, and cap length
 * so the prompt stays bounded. Pure and unit-tested.
 */
export function htmlToText(html: string): string {
  const withoutHead = html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const text = withoutHead
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&(ndash|mdash);/gi, "-")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > MAX_PAGE_CHARS ? text.slice(0, MAX_PAGE_CHARS) : text;
}

export interface FetchedPage {
  text: string;
  /** Cheap hash of the readable text — "changed since last run?" check. */
  contentHash: string;
}

/** Fetch an official page and reduce it to bounded readable text. */
export async function fetchOfficialPage(
  url: string,
  signal?: AbortSignal,
): Promise<FetchedPage | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal });
  if (!res.ok) return null;
  const html = await res.text();
  const text = htmlToText(html);
  if (text.length < 40) return null;
  return { text, contentHash: stableHash(text) };
}

// Tool schema mirrors RawExtraction. Tool use (not free-form JSON) keeps the
// output structured and version-robust across SDK releases.
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "record_sweepstakes",
  description:
    "Record the sweepstakes described on this official page. Use null for any field not clearly present — never guess.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: ["string", "null"], description: "Short, neutral house-voice title (<=70 chars). Not copied verbatim." },
      shortDescription: { type: ["string", "null"], description: "One-sentence house-voice summary (<=140 chars)." },
      longDescription: { type: ["string", "null"] },
      prizeName: { type: ["string", "null"], description: "The prize, as stated. Fact — do not embellish." },
      prizeValue: { type: ["string", "null"], description: "Approx retail value if stated, e.g. \"$10,000\"." },
      prizeCategory: { type: ["string", "null"], description: "Best-fit category, e.g. cash, gift card, travel, vehicle, electronics." },
      entryUrl: { type: ["string", "null"], description: "The entry page URL." },
      officialRulesUrl: { type: ["string", "null"], description: "The official rules URL." },
      startDate: { type: ["string", "null"], description: "ISO date if stated." },
      endDate: { type: ["string", "null"], description: "ISO date the sweepstakes ends." },
      entryFrequency: { type: ["string", "null"], description: "e.g. one time, daily, weekly, monthly, instant win." },
      eligibilityCountry: { type: ["string", "null"], description: "e.g. US, Canada." },
      eligibilityStates: { type: ["array", "null"], items: { type: "string" } },
      ageRequirement: { type: ["integer", "null"] },
      noPurchaseNecessary: { type: ["boolean", "null"], description: "True only if the page affirms no purchase is necessary." },
      sponsorName: { type: ["string", "null"] },
      sponsorUrl: { type: ["string", "null"] },
      mainImageUrl: { type: ["string", "null"] },
      imageAltText: { type: ["string", "null"] },
    },
    required: [],
  },
};

const SYSTEM_PROMPT = [
  "You extract structured sweepstakes data from an official sponsor page for a directory called Sweepza.",
  "Rules:",
  "- Only record facts clearly present on the page. If a field is not stated, use null. Never invent prize, odds, dates, or eligibility.",
  "- Rewrite the title and descriptions in a concise, neutral voice — do not copy the sponsor's marketing text verbatim.",
  "- noPurchaseNecessary is true only if the page explicitly affirms no purchase is necessary.",
  "Call record_sweepstakes exactly once.",
].join("\n");

export interface Extraction {
  raw: RawExtraction;
  pageText: string;
  contentHash: string;
}

/**
 * Fetch + extract one official page. Returns null when the page can't be
 * fetched, the extractor is unconfigured, or no structured result comes back.
 */
export async function extractOfficialPage(
  url: string,
  signal?: AbortSignal,
): Promise<Extraction | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const page = await fetchOfficialPage(url, signal).catch(() => null);
  if (!page) return null;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: env.INGEST_EXTRACTION_MODEL ?? DEFAULT_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_sweepstakes" },
    messages: [
      {
        role: "user",
        content: `Official page: ${url}\n\n---\n${page.text}`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;

  return {
    raw: toolUse.input as RawExtraction,
    pageText: page.text,
    contentHash: page.contentHash,
  };
}
