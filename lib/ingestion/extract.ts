import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { stableHash } from "@/lib/ingestion/fingerprint";
import { stripHtmlTagsQuoteAware } from "@/lib/ingestion/html-text";
import {
  discoverImageCandidates,
  type ImageCandidateDiscovery,
} from "@/lib/ingestion/image-candidates";
import type {
  ConditionalState,
  FetchFailureClass,
  SourceHttpClient,
} from "@/lib/ingestion/http";
import type { RawExtraction } from "@/lib/ingestion/mapper";

// Tier-2 extraction — read the sponsor's OFFICIAL page and turn it into the
// loose RawExtraction the mapper/verifier already understand. Facts (prize,
// odds, dates, eligibility) must come from the page; title/description are
// rewritten in a neutral house voice for SEO. The model is instructed to null
// out anything it can't find rather than invent it.

const MAX_PAGE_CHARS = 14_000;
const DEFAULT_MODEL = "claude-opus-4-8";

/**
 * Reduce fetched HTML to readable text for the extractor: drop scripts/styles/
 * head, strip tags, decode common entities, collapse whitespace, and cap length
 * so the prompt stays bounded. Pure and unit-tested.
 */
export function htmlToText(html: string): string {
  const withBoundaries = html
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n");

  const text = stripHtmlTagsQuoteAware(withBoundaries)
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&(ndash|mdash);/gi, "-")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > MAX_PAGE_CHARS ? text.slice(0, MAX_PAGE_CHARS) : text;
}

export interface FetchedPage {
  /** Original bounded HTML, retained for deterministic media extraction. */
  html: string;
  text: string;
  imageDiscovery: ImageCandidateDiscovery;
  /** Cheap hash of the readable text — "changed since last run?" check. */
  contentHash: string;
  /** Actual response URL. Redirected validators must never be keyed to the request URL. */
  finalUrl: string;
  fetchState: {
    etag: string | null;
    lastModified: string | null;
    httpStatus: number;
  };
}

export type FetchPageResult =
  | { status: "ok"; page: FetchedPage }
  | { status: "not_modified" }
  // `failure` was typed `string`, which threw away the very classification this
  // function exists to expose — the taxonomy is the contract (see http.ts).
  | { status: "failed"; failure: FetchFailureClass; message: string };

/**
 * Fetch an official page through the policy client and reduce it to bounded
 * readable text. Returns the transport's failure CLASS on error rather than a
 * bare null: the caller's lifecycle handling depends on knowing whether the
 * sponsor removed the page (dead link) or the network merely blipped.
 */
export async function fetchOfficialPage(
  url: string,
  http: SourceHttpClient,
  conditional?: ConditionalState,
): Promise<FetchPageResult> {
  // Loading a previously accepted validator is safe; saving the new validator
  // is not. The orchestrator commits it only after the extracted candidate is
  // durably created (or conclusively identified as an existing duplicate).
  const result = await http.get(url, { conditional, persistFetchState: false });

  if (result.status === "not_modified") return { status: "not_modified" };
  if (result.status === "failed") {
    return { status: "failed", failure: result.failure, message: result.message };
  }

  const text = htmlToText(result.body);
  if (text.length < 40) {
    return {
      status: "failed",
      failure: "empty_body",
      message: `${url} yielded ${text.length} characters of readable text`,
    };
  }
  return {
    status: "ok",
    page: {
      html: result.body,
      text,
      imageDiscovery: discoverImageCandidates(result.body, result.finalUrl),
      contentHash: stableHash(text),
      finalUrl: result.finalUrl,
      fetchState: {
        etag: result.etag,
        lastModified: result.lastModified,
        httpStatus: result.httpStatus,
      },
    },
  };
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
  imageDiscovery: ImageCandidateDiscovery;
  contentHash: string;
  finalUrl: string;
  fetchState: FetchedPage["fetchState"];
}

export interface ExtractOptions {
  /** Policy-bound client for the official-page fetch. */
  http: SourceHttpClient;
  conditional?: ConditionalState;
}

/**
 * The outcome of one official-page extraction, CLASSIFIED.
 *
 * This used to be `Extraction | null`, which flattened four different facts into
 * one: the sponsor took the page down (a listing signal), the CDN blipped (retry
 * it), nothing changed since last time (not a failure at all), and the extractor
 * produced nothing (our problem, not theirs). The orchestrator then counted
 * every null as an official-fetch failure — so a run of 304s looked exactly like
 * an outage and could trip the circuit breaker on a perfectly healthy source.
 * The distinction already existed inside fetchOfficialPage; it was being thrown
 * away at this boundary.
 */
export type ExtractionResult =
  | { status: "ok"; extraction: Extraction }
  | { status: "not_modified" }
  /** The source answered badly — carries the transport's failure class. */
  | { status: "failed"; failure: FetchFailureClass; message: string }
  /** We could not extract from a page we DID fetch. Ours, not the source's. */
  | { status: "unextractable"; message: string };

/**
 * Fetch + extract one official page, preserving WHY it did not yield a listing.
 * `fetchOfficialPage` classifies the transport failure; this keeps that
 * classification instead of collapsing it.
 */
export async function extractOfficialPage(
  url: string,
  options: ExtractOptions,
): Promise<ExtractionResult> {
  if (!env.ANTHROPIC_API_KEY) {
    // Not the source's fault — never let this trip a source's circuit breaker.
    return { status: "unextractable", message: "ANTHROPIC_API_KEY is not configured" };
  }

  const fetched = await fetchOfficialPage(url, options.http, options.conditional).catch(
    (error: unknown) => ({
      status: "failed" as const,
      failure: "network" as FetchFailureClass,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  if (fetched.status === "not_modified") return { status: "not_modified" };
  if (fetched.status === "failed") {
    return { status: "failed", failure: fetched.failure, message: fetched.message };
  }
  const page = fetched.page;

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
  if (!toolUse || toolUse.type !== "tool_use") {
    // We fetched the page fine; the extractor gave us nothing structured. That
    // is our failure, and must not be charged to the source.
    return {
      status: "unextractable",
      message: `the extractor returned no structured result for ${url}`,
    };
  }

  return {
    status: "ok",
    extraction: {
      raw: toolUse.input as RawExtraction,
      pageText: page.text,
      imageDiscovery: page.imageDiscovery,
      contentHash: page.contentHash,
      finalUrl: page.finalUrl,
      fetchState: page.fetchState,
    },
  };
}
