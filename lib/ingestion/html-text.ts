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

/** Remove markup with quoted-attribute awareness; this is not an HTML parser. */
export function stripHtmlTagsQuoteAware(value: string): string {
  let output = "";
  let index = 0;

  while (index < value.length) {
    if (value[index] !== "<") {
      output += value[index];
      index += 1;
      continue;
    }

    let quote: '"' | "'" | null = null;
    let end = index + 1;
    for (; end < value.length; end += 1) {
      const character = value[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }

    if (end >= value.length) {
      output += value[index];
      index += 1;
      continue;
    }

    const tag = value.slice(index + 1, end);
    const openingBlock = tag.match(/^\s*(script|style|head|noscript)\b/i)?.[1];
    if (openingBlock) {
      const closing = new RegExp(`</${openingBlock}\\s*>`, "ig");
      closing.lastIndex = end + 1;
      const match = closing.exec(value);
      index = match ? closing.lastIndex : end + 1;
      output += " ";
      continue;
    }

    output += " ";
    index = end + 1;
  }

  return output;
}

/** Protect quoted `>` so structural regexes see only the real tag boundary. */
export function protectQuotedTagDelimiters(value: string): string {
  let output = "";
  let inTag = false;
  let quote: '"' | "'" | null = null;
  for (const character of value) {
    if (!inTag) {
      output += character;
      if (character === "<") inTag = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      output += character === ">" ? "&gt;" : character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output += character;
      continue;
    }
    output += character;
    if (character === ">") inTag = false;
  }
  return output;
}

/**
 * Strip tags and decode entities to readable text. Tags are removed first
 * (repeatedly, so reconstructed `<...>` sequences cannot survive), then entities
 * are decoded exactly once. The output is text for storage/comparison, never
 * re-parsed as HTML.
 */
export function stripHtmlToText(value: string): string {
  let previous: string;
  let stripped = value;
  do {
    previous = stripped;
    stripped = stripHtmlTagsQuoteAware(stripped);
  } while (stripped !== previous);

  return decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
}
