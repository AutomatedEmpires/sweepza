import { ENTRY_FREQUENCIES, type EntryFrequency } from "@/lib/db/enums";
import { dedupKeys, normalizeUrl, type DedupKeys } from "@/lib/ingestion/fingerprint";
import { isValidDateOnly } from "@/lib/ingestion/lifecycle";

// Canonical mapper — turns a loose extraction of an official sweepstakes page
// into the strict, controlled-vocabulary shape the rest of Sweepza speaks
// (aligned with adminListingImportSchema). Pure and network-free: it coerces,
// normalizes to controlled dictionaries, derives dedup identity, and reports
// every field it could not resolve so the pipeline can route low-quality
// candidates to review instead of publishing junk.

/** Loose shape an LLM extractor emits from an official page. */
export interface RawExtraction {
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  prizeName?: string | null;
  prizeValue?: number | string | null;
  prizeCategory?: string | null;
  entryUrl?: string | null;
  officialRulesUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  entryFrequency?: string | null;
  eligibilityCountry?: string | null;
  eligibilityStates?: string[] | null;
  ageRequirement?: number | string | null;
  noPurchaseNecessary?: boolean | string | null;
  sponsorName?: string | null;
  sponsorUrl?: string | null;
  mainImageUrl?: string | null;
  imageAltText?: string | null;
}

export interface NormalizedCandidate {
  title: string;
  shortDescription: string;
  longDescription: string | null;
  prizeName: string;
  prizeValue: number | null;
  prizeCategory: string;
  entryUrl: string | null;
  officialRulesUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  entryFrequency: EntryFrequency;
  eligibilityCountry: string | null;
  eligibilityStates: string[] | null;
  ageRequirement: number | null;
  noPurchaseNecessary: boolean;
  sponsorName: string | null;
  sponsorUrl: string | null;
  mainImageUrl: string | null;
  imageAltText: string | null;
  dedup: DedupKeys;
}

export interface MapResult {
  candidate: NormalizedCandidate;
  /** Human-readable notes on anything missing, truncated, or unmapped. */
  issues: string[];
}

// Controlled category codes (mirror seed_dictionaries). Free-text guesses map in
// via keyword; anything unmatched becomes "other" and is flagged for review.
const CATEGORY_CODES = [
  "cash", "gift_cards", "travel", "vehicles", "electronics", "outdoor", "home",
  "food_beverage", "fashion_beauty", "family_kids", "experiences", "seasonal", "other",
] as const;

const CATEGORY_KEYWORDS: Array<[RegExp, (typeof CATEGORY_CODES)[number]]> = [
  [/gift\s*card|visa\s*card|e-?gift/, "gift_cards"],
  [/cash|money|\$\d|check|paypal|venmo/, "cash"],
  [/trip|travel|vacation|cruise|flight|getaway|resort|hotel/, "travel"],
  [/car|truck|suv|vehicle|jeep|motorcycle|atv/, "vehicles"],
  [/tv|laptop|phone|iphone|ipad|console|xbox|playstation|electronic|camera|headphone|gaming/, "electronics"],
  [/grill|camping|kayak|cooler|fishing|hunting|outdoor|patio/, "outdoor"],
  [/kitchen|furniture|home|mattress|appliance|vacuum|decor/, "home"],
  [/food|snack|candy|coffee|beverage|drink|wine|beer|meal/, "food_beverage"],
  [/beauty|makeup|skincare|cosmetic|fashion|apparel|clothing|shoes|jewelry|handbag/, "fashion_beauty"],
  [/baby|kids|toy|family|stroller|diaper|lego/, "family_kids"],
  [/experience|concert|tickets|event|festival|game\s*day|vip|meet\s*and\s*greet/, "experiences"],
  [/holiday|christmas|halloween|thanksgiving|seasonal|summer|back\s*to\s*school/, "seasonal"],
];

const FREQUENCY_KEYWORDS: Array<[RegExp, EntryFrequency]> = [
  [/instant|scratch/, "instant_win"],
  [/daily|every\s*day|once\s*(a|per)\s*day|24\s*hours/, "daily"],
  [/weekly|once\s*(a|per)\s*week/, "weekly"],
  [/monthly|once\s*(a|per)\s*month/, "monthly"],
  [/one[-\s]?time|single|once\s*only|enter\s*once|one\s*entry/, "one_time"],
];

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): { value: string; truncated: boolean } {
  if (value.length <= max) return { value, truncated: false };
  return { value: value.slice(0, max).trim(), truncated: true };
}

function parseMoney(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseInteger(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : Math.trunc(value);
  if (!value) return null;
  const n = Number.parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Coerce to a YYYY-MM-DD date, or null when unparseable. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(trimmed);
  if (!iso || !isValidDateOnly(iso[1])) return null;
  if (trimmed === iso[1]) return iso[1];
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : iso[1];
}

function parseBoolean(value: boolean | string | null | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (!value) return false;
  return /^(true|yes|y|1)$/i.test(value.trim());
}

function mapCategory(value: string | null | undefined): (typeof CATEGORY_CODES)[number] | null {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  if ((CATEGORY_CODES as readonly string[]).includes(text)) {
    return text as (typeof CATEGORY_CODES)[number];
  }
  for (const [pattern, code] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

function mapFrequency(value: string | null | undefined): EntryFrequency | null {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  if ((ENTRY_FREQUENCIES as readonly string[]).includes(text)) {
    return text as EntryFrequency;
  }
  for (const [pattern, freq] of FREQUENCY_KEYWORDS) {
    if (pattern.test(text)) return freq;
  }
  return null;
}

function mapCountry(value: string | null | undefined): string | null {
  const text = clean(value);
  if (!text) return null;
  if (/^(us|usa|u\.s\.?a?\.?|united states)$/i.test(text)) return "US";
  if (/^(ca|canada)$/i.test(text)) return "CA";
  if (/^(uk|gb|united kingdom|great britain)$/i.test(text)) return "GB";
  return text;
}

/**
 * Map a raw extraction to the canonical candidate shape, collecting issues for
 * anything missing, truncated, or unmapped. Never throws — a garbage input
 * yields a low-quality candidate with a full issue list, which the verifier
 * (verify.ts) then routes to review rather than publish.
 */
export function mapExtraction(raw: RawExtraction): MapResult {
  const issues: string[] = [];

  const titleRaw = clean(raw.title);
  if (!titleRaw) issues.push("Missing title.");
  const title = truncate(titleRaw, 70);
  if (title.truncated) issues.push("Title truncated to 70 characters.");

  const shortRaw = clean(raw.shortDescription);
  if (!shortRaw) issues.push("Missing short description.");
  const short = truncate(shortRaw, 140);
  if (short.truncated) issues.push("Short description truncated to 140 characters.");

  const prizeName = clean(raw.prizeName);
  if (!prizeName) issues.push("Missing prize name.");

  const category = mapCategory(raw.prizeCategory);
  if (!category) issues.push(`Unmapped prize category "${clean(raw.prizeCategory)}" — defaulted to "other".`);

  const frequency = mapFrequency(raw.entryFrequency);
  if (!frequency) issues.push(`Unmapped entry frequency "${clean(raw.entryFrequency)}" — defaulted to "other".`);

  const officialRulesUrl = normalizeUrl(raw.officialRulesUrl);
  if (!officialRulesUrl) issues.push("Missing or invalid official rules URL.");
  const entryUrl = normalizeUrl(raw.entryUrl);
  if (!entryUrl) issues.push("Missing or invalid entry URL.");

  const endDate = toIsoDate(raw.endDate);
  if (!endDate) issues.push("Missing or unparseable end date.");

  if (raw.noPurchaseNecessary == null) {
    issues.push("No-purchase-necessary not confirmed on the source.");
  }

  const longRaw = clean(raw.longDescription);
  const long = longRaw ? truncate(longRaw, 2000).value : null;

  const eligibilityStates = raw.eligibilityStates == null
    ? null
    : raw.eligibilityStates.map((state) => clean(state).toUpperCase()).filter(Boolean);

  const candidate: NormalizedCandidate = {
    title: title.value,
    shortDescription: short.value,
    longDescription: long,
    prizeName,
    prizeValue: parseMoney(raw.prizeValue),
    prizeCategory: category ?? "other",
    entryUrl,
    officialRulesUrl,
    startDate: toIsoDate(raw.startDate),
    endDate,
    entryFrequency: frequency ?? "other",
    eligibilityCountry: mapCountry(raw.eligibilityCountry),
    eligibilityStates,
    ageRequirement: parseInteger(raw.ageRequirement),
    noPurchaseNecessary: parseBoolean(raw.noPurchaseNecessary),
    sponsorName: clean(raw.sponsorName) || null,
    sponsorUrl: normalizeUrl(raw.sponsorUrl),
    mainImageUrl: normalizeUrl(raw.mainImageUrl),
    imageAltText: clean(raw.imageAltText) || null,
    dedup: dedupKeys({
      officialRulesUrl,
      entryUrl,
      sponsorName: raw.sponsorName,
      prizeName,
      endDate,
      eligibilityCountry: mapCountry(raw.eligibilityCountry),
      eligibilityStates,
    }),
  };

  return { candidate, issues };
}
