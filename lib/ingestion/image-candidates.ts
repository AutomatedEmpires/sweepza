import { load } from "cheerio";

export type ImageExtractionMethod =
  | "json_ld"
  | "open_graph"
  | "twitter_card"
  | "dom_hero"
  | "responsive_srcset"
  | "lazy_loaded"
  | "css_background"
  | "sponsor_asset";

export type ImageCandidateRole = "primary" | "sponsor_logo";
export type ImageRightsStatus = "permitted" | "restricted" | "unknown";

export interface ImageRightsEvidence {
  status: ImageRightsStatus;
  licenseUrl: string | null;
  attribution: string | null;
  reason: string;
}

export interface ImageCandidate {
  url: string;
  method: ImageExtractionMethod;
  role: ImageCandidateRole;
  score: number;
  altText: string | null;
  context: string | null;
  widthHint: number | null;
  heightHint: number | null;
  rights: ImageRightsEvidence;
}

export interface RejectedImageCandidate {
  url: string;
  method: ImageExtractionMethod;
  score: number;
  reasons: string[];
}

export interface ImageCandidateDiscovery {
  candidates: ImageCandidate[];
  rejected: RejectedImageCandidate[];
}

interface CandidateInput {
  rawUrl: string;
  method: ImageExtractionMethod;
  altText?: string | null;
  context?: string | null;
  widthHint?: number | null;
  heightHint?: number | null;
  role?: ImageCandidateRole;
  position?: number;
  licenseUrl?: string | null;
  attribution?: string | null;
  rightsText?: string | null;
}

const METHOD_SCORE: Record<ImageExtractionMethod, number> = {
  json_ld: 100,
  open_graph: 94,
  twitter_card: 88,
  dom_hero: 76,
  responsive_srcset: 72,
  lazy_loaded: 68,
  css_background: 60,
  sponsor_asset: 34,
};

const POSITIVE_TERMS =
  /sweepstakes?|giveaway|contest|grand[\s_-]*prize|prize|enter[\s_-]*to[\s_-]*win|winner|vehicle|vacation|travel|cash|gift[\s_-]*card|bundle|home[\s_-]*sweet[\s_-]*home/i;
const HERO_TERMS = /hero|feature|campaign|promotion|promo|masthead|cover|prize/i;
const STRONG_DOM_HERO_TERMS =
  /(?:^|[\s_\-/])(hero|masthead|campaign|promotion|promo)(?:[\s_.\-/]|$)/i;
const STRONG_PROMOTION_TERMS =
  /sweepstakes?|giveaway|contest|grand[\s_-]*prize|prize|enter[\s_-]*to[\s_-]*win|winner/i;
const LOGO_TERMS = /(?:^|[\s_\-/])(logo|brandmark|wordmark)(?:[\s_.\-/]|$)/i;
const IRRELEVANT_TERMS =
  /tracking|pixel|spacer|beacon|favicon|sprite|emoji|avatar|profile|cookie|consent|captcha|spinner|loader|loading|social[\s_-]*icon|facebook|instagram|pinterest|tiktok|youtube|doubleclick|advert|adserver|related[\s_-]*(?:story|article)|recommended[\s_-]*(?:story|article)/i;
const PLACEHOLDER_TERMS = /placeholder|transparent(?:\.gif)?|blank(?:\.gif)?|no[\s_-]*image|image[\s_-]*missing/i;

function cleanText(value: string | null | undefined, max = 360): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function positiveInteger(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveImageUrl(raw: string, pageUrl: string): string | null {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!value || /^(data|blob|javascript):/i.test(value)) return null;
  try {
    const url = new URL(value.startsWith("//") ? `${new URL(pageUrl).protocol}${value}` : value, pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function chooseSrcset(value: string | null | undefined): string | null {
  if (!value) return null;
  const choices = value
    .split(",")
    .map((part) => {
      const match = /^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?\s*$/.exec(part.trim());
      if (!match) return null;
      const amount = match[2] ? Number(match[2]) : 1;
      return { url: match[1], weight: match[3] === "w" ? amount : amount * 1_000 };
    })
    .filter((choice): choice is { url: string; weight: number } => Boolean(choice));
  choices.sort((a, b) => b.weight - a.weight);
  return choices[0]?.url ?? null;
}

function assessRights(input: {
  licenseUrl?: string | null;
  attribution?: string | null;
  rightsText?: string | null;
  pageLicenseUrl?: string | null;
  pageRightsText?: string | null;
}): ImageRightsEvidence {
  const candidateLicenseUrl = cleanText(input.licenseUrl, 500);
  const pageLicenseUrl = cleanText(input.pageLicenseUrl, 500);
  const licenseUrls = [candidateLicenseUrl, pageLicenseUrl].filter((value): value is string => Boolean(value));
  const attribution = cleanText(input.attribution, 500);
  const candidateText = cleanText(input.rightsText, 500) ?? "";
  const pageText = cleanText(input.pageRightsText, 500) ?? "";
  const text = `${candidateText} ${pageText}`.trim();
  const evidence = `${licenseUrls.join(" ")} ${text}`;
  const candidateEvidence = `${candidateLicenseUrl ?? ""} ${candidateText}`;
  const attributionRequiredLicense = licenseUrls.find((value) =>
    /creativecommons\.org\/licenses\/(?:by|by-sa)(?:\/|$)/i.test(value),
  ) ?? null;
  const attributionRequiredText =
    /\bcc[\s_-]*by(?:[\s_-]*sa)?(?:[\s_-]*\d(?:\.\d)?)?\b|creative commons attribution(?:[\s_-]*share[\s_-]*alike)?/i.test(text);
  const restrictedLicense = licenseUrls.find((value) =>
    /creativecommons\.org\/licenses\/(?:by-nc|by-nd|by-nc-sa|by-nc-nd)(?:\/|$)/i.test(value),
  ) ?? null;
  const restrictedLicenseText =
    /\bcc[\s_-]*by[\s_-]*(?:nc|nd)(?:[\s_-]*(?:sa|nd))?\b/i.test(text);

  // Restrictive or conflicting evidence always wins. Public license evidence
  // cannot override an explicit reservation of rights, and attribution-bearing
  // licenses remain ineligible until Sweepza renders the required public notice.
  if (
    restrictedLicense
    || restrictedLicenseText
    || /all rights reserved|do not (?:copy|reproduce|reuse)|permission required|licensed stock|noncommercial|non-commercial|no derivatives|not (?:in the )?public domain/i.test(evidence)
  ) {
    return {
      status: "restricted",
      licenseUrl: restrictedLicense ?? candidateLicenseUrl ?? pageLicenseUrl,
      attribution,
      reason: "page rights text does not permit automatic Sweepza reuse",
    };
  }

  if (attributionRequiredLicense || attributionRequiredText) {
    return {
      status: "restricted",
      licenseUrl: attributionRequiredLicense ?? candidateLicenseUrl ?? pageLicenseUrl,
      attribution,
      reason: "attribution-required licenses are not eligible until Sweepza publishes the required license notice",
    };
  }

  // Automatic reuse is deliberately limited to rights that require neither
  // attribution nor a downstream license notice. Permissive page-level
  // declarations describe the document, not every embedded asset, so only
  // candidate-bound evidence can authorize reuse.
  if (
    /creativecommons\.org\/publicdomain\/(?:zero|mark)(?:\/|$)|creativecommons\.org\/public-domain/i.test(candidateEvidence)
    || /(?:^|\s)cc0(?:\s*1\.0)?(?:\s|$)|\bpublic domain\b/i.test(candidateEvidence)
  ) {
    return {
      status: "permitted",
      licenseUrl: candidateLicenseUrl,
      attribution,
      reason: "asset declares a CC0 or public-domain image license",
    };
  }

  return {
    status: "unknown",
    licenseUrl: candidateLicenseUrl,
    attribution,
    reason: "no reusable image license or host authorization was found",
  };
}

function mergeRightsEvidence(
  preferred: ImageRightsEvidence,
  supplement: ImageRightsEvidence,
): ImageRightsEvidence {
  const rank: Record<ImageRightsStatus, number> = {
    restricted: 2,
    permitted: 1,
    unknown: 0,
  };
  const winner = rank[supplement.status] > rank[preferred.status] ? supplement : preferred;
  const other = winner === preferred ? supplement : preferred;
  return {
    ...winner,
    licenseUrl: winner.licenseUrl ?? other.licenseUrl,
    attribution: winner.attribution ?? other.attribution,
  };
}

function scoreCandidate(input: CandidateInput, url: string): { score: number; role: ImageCandidateRole; reasons: string[] } {
  const alt = cleanText(input.altText) ?? "";
  const context = cleanText(input.context) ?? "";
  const haystack = `${url} ${alt} ${context}`;
  let role = input.role ?? (LOGO_TERMS.test(haystack) ? "sponsor_logo" : "primary");
  let score = METHOD_SCORE[input.method];
  const reasons: string[] = [];

  if (POSITIVE_TERMS.test(haystack)) score += 22;
  if (HERO_TERMS.test(haystack)) score += 12;
  if (alt.length >= 8) score += 5;
  if ((input.position ?? 99) <= 2) score += 4;

  const width = input.widthHint ?? null;
  const height = input.heightHint ?? null;
  if (width && height) {
    const area = width * height;
    const ratio = width / height;
    if (width <= 64 || height <= 64 || area < 16_000) reasons.push("dimensions_too_small");
    else if (area >= 500_000) score += 14;
    else if (area >= 180_000) score += 8;
    if (ratio >= 1.2 && ratio <= 2.4) score += 7;
    if (ratio < 0.35 || ratio > 4.5) score -= 18;
  }

  if (IRRELEVANT_TERMS.test(haystack)) reasons.push("irrelevant_or_tracking_asset");
  if (PLACEHOLDER_TERMS.test(haystack)) reasons.push("placeholder_asset");
  if (
    input.method === "dom_hero"
    && role === "primary"
    && !STRONG_DOM_HERO_TERMS.test(haystack)
    && !STRONG_PROMOTION_TERMS.test(haystack)
  ) {
    reasons.push("insufficient_promotion_context");
  }
  if (/\.(?:ico|svg)(?:$|[?#])/i.test(url)) reasons.push("unsupported_primary_format");
  if (/\.gif(?:$|[?#])/i.test(url) && /transparent|pixel|spacer|blank/i.test(url)) {
    reasons.push("transparent_tracking_gif");
  }

  if (role === "sponsor_logo") {
    score = Math.min(score, METHOD_SCORE.sponsor_asset + (POSITIVE_TERMS.test(context) ? 8 : 0));
    if (input.method !== "sponsor_asset") role = "sponsor_logo";
  }

  const threshold = role === "sponsor_logo" ? 18 : 42;
  if (score < threshold) reasons.push("score_below_threshold");
  return { score, role, reasons };
}

function valuesFromJsonLdImage(value: unknown): Array<{
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  licenseUrl: string | null;
  attribution: string | null;
  rightsText: string | null;
}> {
  if (typeof value === "string") {
    return [{ url: value, altText: null, width: null, height: null, licenseUrl: null, attribution: null, rightsText: null }];
  }
  if (Array.isArray(value)) return value.flatMap(valuesFromJsonLdImage);
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  const url = [item.url, item.contentUrl, item.thumbnailUrl]
    .find((candidate): candidate is string => typeof candidate === "string");
  if (!url) return [];
  const asString = (candidate: unknown) => typeof candidate === "string" ? candidate : null;
  const asNumber = (candidate: unknown) => {
    const parsed = typeof candidate === "number" ? candidate : Number.parseInt(String(candidate ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return [{
    url,
    altText: asString(item.caption) ?? asString(item.name) ?? asString(item.description),
    width: asNumber(item.width),
    height: asNumber(item.height),
    licenseUrl: asString(item.license) ?? asString(item.acquireLicensePage),
    attribution: asString(item.creditText) ?? asString(item.creator) ?? asString(item.copyrightHolder),
    rightsText: asString(item.copyrightNotice),
  }];
}

/**
 * Layered, deterministic image discovery. It never performs network I/O and it
 * never treats the first page image as the winner. Candidates retain scores,
 * methods, rights evidence, and rejection reasons for operator diagnostics.
 */
export function discoverImageCandidates(html: string, pageUrl: string): ImageCandidateDiscovery {
  const $ = load(html);
  const accepted = new Map<string, ImageCandidate>();
  const rejected: RejectedImageCandidate[] = [];

  const pageLicenseUrl =
    $("link[rel='license']").first().attr("href")
    ?? $("meta[name='license']").first().attr("content")
    ?? null;
  const pageRightsText =
    $("meta[name='copyright']").first().attr("content")
    ?? $("meta[name='rights']").first().attr("content")
    ?? null;

  const add = (input: CandidateInput) => {
    const url = resolveImageUrl(input.rawUrl, pageUrl);
    if (!url) {
      rejected.push({
        url: input.rawUrl.slice(0, 500),
        method: input.method,
        score: 0,
        reasons: ["unusable_or_non_http_url"],
      });
      return;
    }

    const { score, role, reasons } = scoreCandidate(input, url);
    if (reasons.length > 0) {
      rejected.push({ url, method: input.method, score, reasons });
      return;
    }

    const candidate: ImageCandidate = {
      url,
      method: role === "sponsor_logo" ? "sponsor_asset" : input.method,
      role,
      score,
      altText: cleanText(input.altText),
      context: cleanText(input.context),
      widthHint: input.widthHint ?? null,
      heightHint: input.heightHint ?? null,
      rights: assessRights({
        licenseUrl: input.licenseUrl,
        attribution: input.attribution,
        rightsText: input.rightsText,
        pageLicenseUrl,
        pageRightsText,
      }),
    };
    const previous = accepted.get(url);
    if (!previous) {
      accepted.set(url, candidate);
      return;
    }

    // The same asset often appears in metadata and again in the DOM. Retain
    // the strongest extraction method for provenance while merging richer DOM
    // dimensions/alt text and the higher contextual score.
    const preferred = METHOD_SCORE[candidate.method] > METHOD_SCORE[previous.method]
      ? candidate
      : previous;
    const supplement = preferred === candidate ? previous : candidate;
    accepted.set(url, {
      ...preferred,
      score: Math.max(previous.score, candidate.score),
      altText: preferred.altText ?? supplement.altText,
      context: preferred.context ?? supplement.context,
      widthHint: preferred.widthHint ?? supplement.widthHint,
      heightHint: preferred.heightHint ?? supplement.heightHint,
      rights: mergeRightsEvidence(preferred.rights, supplement.rights),
    });
  };

  // 1. Structured data. Walk every JSON-LD object and only inspect image-like
  // keys, rather than treating unrelated contentUrl fields as media.
  $("script[type='application/ld+json']").each((_index, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const visit = (value: unknown, depth = 0) => {
      if (depth > 12 || !value) return;
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child, depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      const object = value as Record<string, unknown>;
      const objectTypes = Array.isArray(object["@type"])
        ? object["@type"]
        : [object["@type"]];
      const objectIsImageObject = objectTypes.some((type) =>
        typeof type === "string" && /(?:^|[/:])ImageObject$/.test(type)
      );
      for (const key of ["image", "primaryImageOfPage", "thumbnailUrl", "associatedMedia"]) {
        if (!(key in object)) continue;
        for (const image of valuesFromJsonLdImage(object[key])) {
          add({
            rawUrl: image.url,
            method: "json_ld",
            altText: image.altText,
            context: cleanText(`${String(object.name ?? "")} ${String(object.headline ?? "")}`),
            widthHint: image.width,
            heightHint: image.height,
            licenseUrl: image.licenseUrl ?? (objectIsImageObject && typeof object.license === "string" ? object.license : null),
            attribution: image.attribution ?? (objectIsImageObject && typeof object.creditText === "string" ? object.creditText : null),
            rightsText: image.rightsText ?? (objectIsImageObject && typeof object.copyrightNotice === "string" ? object.copyrightNotice : null),
          });
        }
      }
      Object.values(object).forEach((child) => visit(child, depth + 1));
    };
    visit(parsed);
  });

  // 2-3. Social metadata. Width/height/alt are attached to the closest prior
  // image declaration, matching the grouping used by Open Graph publishers.
  const social: Record<"open_graph" | "twitter_card", CandidateInput[]> = {
    open_graph: [],
    twitter_card: [],
  };
  $("meta").each((_index, element) => {
    const key = (($(element).attr("property") ?? $(element).attr("name") ?? "")).toLowerCase();
    const content = $(element).attr("content") ?? "";
    const method = key.startsWith("og:image")
      ? "open_graph"
      : key.startsWith("twitter:image")
        ? "twitter_card"
        : null;
    if (!method) return;
    const list = social[method];
    if (key === "og:image" || key === "og:image:url" || key === "og:image:secure_url" || key === "twitter:image" || key === "twitter:image:src") {
      list.push({ rawUrl: content, method });
      return;
    }
    const current = list[list.length - 1];
    if (!current) return;
    if (key.endsWith(":width")) current.widthHint = positiveInteger(content);
    else if (key.endsWith(":height")) current.heightHint = positiveInteger(content);
    else if (key.endsWith(":alt")) current.altText = content;
  });
  Object.values(social).flat().forEach(add);

  // 4-6. Visible, responsive, and lazy DOM imagery.
  $("img").each((position, element) => {
    const image = $(element);
    const alt = image.attr("alt") ?? image.attr("title") ?? null;
    const context = cleanText([
      image.attr("class"), image.attr("id"), alt,
      image.closest("figure,article,section,header,main").first().text().slice(0, 500),
    ].filter(Boolean).join(" "));
    const widthHint = positiveInteger(image.attr("width"));
    const heightHint = positiveInteger(image.attr("height"));

    const responsive = chooseSrcset(image.attr("srcset") ?? image.attr("data-srcset"));
    if (responsive) add({ rawUrl: responsive, method: "responsive_srcset", altText: alt, context, widthHint, heightHint, position });

    const lazy = ["data-src", "data-lazy-src", "data-original", "data-image", "data-lazy", "data-url"]
      .map((name) => image.attr(name))
      .find(Boolean);
    if (lazy) add({ rawUrl: lazy, method: "lazy_loaded", altText: alt, context, widthHint, heightHint, position });

    const src = image.attr("src");
    if (src) {
      const isSponsorLogo = LOGO_TERMS.test(`${src} ${context}`);
      add({
        rawUrl: src,
        method: isSponsorLogo ? "sponsor_asset" : "dom_hero",
        role: isSponsorLogo ? "sponsor_logo" : "primary",
        altText: alt,
        context,
        widthHint,
        heightHint,
        position,
      });
    }
  });

  $("picture source").each((position, element) => {
    const source = $(element);
    const selected = chooseSrcset(source.attr("srcset") ?? source.attr("data-srcset"));
    if (!selected) return;
    const picture = source.closest("picture");
    const image = picture.find("img").first();
    add({
      rawUrl: selected,
      method: "responsive_srcset",
      altText: image.attr("alt"),
      context: cleanText(`${picture.attr("class") ?? ""} ${picture.closest("figure,article,section,header").first().text().slice(0, 400)}`),
      widthHint: positiveInteger(source.attr("width") ?? image.attr("width")),
      heightHint: positiveInteger(source.attr("height") ?? image.attr("height")),
      position,
    });
  });

  // 7. CSS background images. Inline style is intentionally bounded; linked
  // stylesheets are another source fetch and remain outside this page pass.
  $("[style*='background']").each((position, element) => {
    const node = $(element);
    const style = node.attr("style") ?? "";
    for (const match of style.matchAll(/(?:background|background-image)[^;]*url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)) {
      add({
        rawUrl: match[2],
        method: "css_background",
        context: cleanText(`${node.attr("class") ?? ""} ${node.attr("id") ?? ""} ${node.text().slice(0, 400)}`),
        widthHint: positiveInteger(node.attr("width")),
        heightHint: positiveInteger(node.attr("height")),
        position,
      });
    }
  });

  return {
    candidates: [...accepted.values()].sort((a, b) => b.score - a.score).slice(0, 50),
    rejected: rejected.sort((a, b) => b.score - a.score).slice(0, 100),
  };
}
