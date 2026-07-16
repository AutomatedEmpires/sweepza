// Shared HTML-to-text helpers for discovery adapters.
//
// Entity decoding is done in a SINGLE left-to-right pass with one replacer, so a
// decoded "&" can never be re-scanned into a second entity. Decoding named and
// numeric entities in separate `.replace` passes (e.g. `&amp;` → `&`, then
// `&#39;` → `'`) is the classic double-unescape defect: `&amp;#39;` becomes
// `&#39;` on the first pass and `'` on the second, reconstructing a character
// the source had deliberately escaped. One pass closes that hole.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  trade: "™",
  reg: "®",
};

/** Decode HTML entities in one pass; unknown entities are left verbatim. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const key = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
      ? NAMED_ENTITIES[key]
      : match;
  });
}

/**
 * Strip tags and decode entities to readable text. Tags are removed first
 * (repeatedly, so reconstructed `<...>` sequences cannot survive), then entities
 * are decoded exactly once. The output is text for storage/comparison, never
 * re-parsed as HTML.
 */
export function stripHtmlToText(value: string): string {
  const withoutBlocks = value.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1[^>]*>/gi,
    " ",
  );
  let previous: string;
  let stripped = withoutBlocks;
  do {
    previous = stripped;
    stripped = stripped.replace(/<[^>]*>/g, " ");
  } while (stripped !== previous);

  return decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
}
