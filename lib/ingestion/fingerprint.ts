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
