// Ingestion identity & dedup — the core of "never ingest the same sweep twice."
//
// The design treats the sponsor's OFFICIAL page as the source of truth, so the
// normalized official URL is a listing's natural identity. Two broad discovery
// sites that both point at the same official rules page collapse to one key.
// When no official URL is available, a content fingerprint (sponsor + prize +
// end date) is the fallback identity. Pure and dependency-free so the dedup
// rules are unit-testable in isolation from any crawler or database.

// Query params that never identify a sweep — tracking/analytics noise that would
// otherwise make the "same" URL look distinct across sources.
const TRACKING_PARAMS = new Set([
  "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src",
  "referrer", "_hsenc", "_hsmi", "vero_id", "yclid", "twclid", "s_kwcid",
]);

/**
 * Canonicalize a URL to a stable identity string, or null if unparseable.
 * Merges http/https and www, drops tracking params and fragments, sorts the
 * remaining query, and trims trailing slashes so cosmetic variants unify.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const host = url.port ? `${hostname}:${url.port}` : hostname;

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      url.searchParams.delete(key);
    }
  }
  const sorted = [...url.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const search = sorted.length
    ? `?${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`
    : "";

  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host}${path}${search}`;
}

/**
 * A listing's primary identity: the official rules URL if present, else the
 * entry URL. This is what makes re-ingestion idempotent — the same official
 * page always resolves to the same key, so an upsert refreshes instead of
 * duplicating.
 */
export function officialUrlKey(
  officialRulesUrl?: string | null,
  entryUrl?: string | null,
): string | null {
  return normalizeUrl(officialRulesUrl) ?? normalizeUrl(entryUrl);
}

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Fold thousands separators so "$10,000" and "$10000" share an identity.
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// FNV-1a (32-bit) — a tiny, stable, dependency-free hash. Good enough for a
// dedup candidate signal; a human confirms suspected duplicates downstream.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable, dependency-free content hash (FNV-1a hex) — e.g. "has this page
 * changed since last run?" without re-running extraction. */
export function stableHash(input: string): string {
  return fnv1a(input);
}

export interface FingerprintInput {
  sponsorName?: string | null;
  prizeName?: string | null;
  endDate?: string | null;
  eligibilityCountry?: string | null;
  officialRulesUrl?: string | null;
  entryUrl?: string | null;
}

/**
 * Identity of a sweep independent of URL — sponsor + prize + end date +
 * country. Catches the same sweep surfaced under slightly different links.
 */
export function contentFingerprint(input: FingerprintInput): string {
  return fnv1a(
    [
      normalizeText(input.sponsorName),
      normalizeText(input.prizeName),
      (input.endDate ?? "").slice(0, 10),
      normalizeText(input.eligibilityCountry),
    ].join("|"),
  );
}

export interface DedupKeys {
  /** Primary identity from the official/entry URL, or null when neither parses. */
  urlKey: string | null;
  /** Fallback identity from listing content. */
  contentKey: string;
}

export function dedupKeys(input: FingerprintInput): DedupKeys {
  return {
    urlKey: officialUrlKey(input.officialRulesUrl, input.entryUrl),
    contentKey: contentFingerprint(input),
  };
}

/**
 * Two candidates are likely the same sweep when their official-URL identities
 * match, or (URL absent/differing) when their content fingerprints match. A
 * match means "upsert / hold for review," never "silently publish a second
 * copy."
 */
export function isLikelyDuplicate(a: DedupKeys, b: DedupKeys): boolean {
  if (a.urlKey && b.urlKey) return a.urlKey === b.urlKey;
  return a.contentKey === b.contentKey;
}

// Explainable duplicate detection. A silent "these are the same" is exactly what
// the mandate warns against — distinct regional or recurring sweepstakes must
// not be collapsed without evidence, and a reviewer resolving a suspected
// duplicate needs to see WHICH signals matched. This layer reports the matched
// signals and a strength, and it deliberately treats matches on identity
// (official URL) as conclusive while treating content-only matches as suspected
// (a human confirms).

export interface DuplicateSignal {
  id:
    | "same_official_url"
    | "same_entry_url"
    | "same_sponsor"
    | "same_prize"
    | "same_end_date"
    | "same_country";
  matched: boolean;
  detail: string;
}

export type DuplicateVerdict = "identical" | "suspected" | "distinct";

export interface DuplicateExplanation {
  verdict: DuplicateVerdict;
  /** 0..1 share of comparable content signals that matched. */
  strength: number;
  signals: DuplicateSignal[];
  reason: string;
}

/**
 * Explain whether two candidates are the same sweep, with evidence. An
 * official-URL identity match is conclusive ("identical"). Otherwise the
 * content signals (sponsor + prize + end date + country) are weighed: a strong
 * agreement is "suspected" (route to review), while weak agreement is
 * "distinct" — because a national and a Canada-only variant of the same
 * promotion, or this year's and last year's relaunch, legitimately share a
 * sponsor and prize but are different sweepstakes.
 */
export function explainDuplicate(
  a: FingerprintInput,
  b: FingerprintInput,
): DuplicateExplanation {
  const aKeys = dedupKeys(a);
  const bKeys = dedupKeys(b);

  const sameOfficialUrl = Boolean(aKeys.urlKey) && aKeys.urlKey === bKeys.urlKey;
  const aEntry = normalizeUrl(a.entryUrl);
  const bEntry = normalizeUrl(b.entryUrl);
  const sameEntryUrl = Boolean(aEntry) && aEntry === bEntry;

  const sameSponsor =
    normalizeText(a.sponsorName) !== "" &&
    normalizeText(a.sponsorName) === normalizeText(b.sponsorName);
  const samePrize =
    normalizeText(a.prizeName) !== "" &&
    normalizeText(a.prizeName) === normalizeText(b.prizeName);
  const sameEndDate =
    Boolean(a.endDate) && (a.endDate ?? "").slice(0, 10) === (b.endDate ?? "").slice(0, 10);
  const sameCountry =
    normalizeText(a.eligibilityCountry) !== "" &&
    normalizeText(a.eligibilityCountry) === normalizeText(b.eligibilityCountry);

  const signals: DuplicateSignal[] = [
    { id: "same_official_url", matched: sameOfficialUrl, detail: aKeys.urlKey ?? "no official url" },
    { id: "same_entry_url", matched: sameEntryUrl, detail: aEntry ?? "no entry url" },
    { id: "same_sponsor", matched: sameSponsor, detail: a.sponsorName ?? "no sponsor" },
    { id: "same_prize", matched: samePrize, detail: a.prizeName ?? "no prize" },
    { id: "same_end_date", matched: sameEndDate, detail: a.endDate ?? "no end date" },
    { id: "same_country", matched: sameCountry, detail: a.eligibilityCountry ?? "no country" },
  ];

  if (sameOfficialUrl) {
    return {
      verdict: "identical",
      strength: 1,
      signals,
      reason: "same normalized official URL — conclusively the same sweepstakes",
    };
  }

  // Weigh the content signals. End date and country are the discriminators that
  // separate regional/recurring variants, so they carry weight alongside the
  // sponsor/prize identity.
  const contentSignals = [sameSponsor, samePrize, sameEndDate, sameCountry];
  const matchedCount = contentSignals.filter(Boolean).length;
  const strength = Number((matchedCount / contentSignals.length).toFixed(2));

  // Suspected requires sponsor AND prize to match AND BOTH discriminators to
  // agree (or be absent). A single contradiction is decisive:
  //   - different end date  ⇒ a recurring relaunch (this year vs last year)
  //   - different country   ⇒ a regional variant (US vs Canada-only)
  // Both are legitimately distinct sweepstakes that happen to share a sponsor
  // and prize, so they must never be silently merged.
  const coreMatch = sameSponsor && samePrize;
  const bothCountriesAbsent =
    normalizeText(a.eligibilityCountry) === "" && normalizeText(b.eligibilityCountry) === "";
  const bothDatesAbsent = !a.endDate && !b.endDate;
  const dateOk = sameEndDate || bothDatesAbsent;
  const countryOk = sameCountry || bothCountriesAbsent;

  if (coreMatch && dateOk && countryOk) {
    return {
      verdict: "suspected",
      strength,
      signals,
      reason: "same sponsor, prize, end date and region — suspected duplicate, confirm before merging",
    };
  }

  return {
    verdict: "distinct",
    strength,
    signals,
    reason: coreMatch
      ? "same sponsor and prize but a differing end date or region — a regional or recurring variant, kept distinct"
      : "insufficient signal agreement — treated as distinct",
  };
}
