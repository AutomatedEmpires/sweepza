import type { ImageCandidateDiscovery } from "@/lib/ingestion/image-candidates";

/**
 * A "source preview" is the sweepstakes operator's OWN representative image —
 * the og:image / JSON-LD image / hero the source published for link previews —
 * rendered on a Sweepza listing as an attributed preview that links back to the
 * source. It is deliberately distinct from the rights-gated, stored `photo_bucket`
 * media pipeline (lib/ingestion/image-pipeline.ts):
 *
 *   - photo_bucket = a rights-cleared image whose BYTES Sweepza has fetched and
 *     stored in an approved media provider. Sweepza has none today, so that lane
 *     is dormant and fails closed.
 *   - source preview = we do NOT copy or host the bytes. We store the source URL
 *     itself (persisted as `image_source_type = 'external_reference'`) and render
 *     it, exactly as a host who submits a public image URL already does today.
 *     This is the product contract's "store the source URL and render it" path
 *     for the storage=none world, and it is why listings stop feeling flat.
 *
 * The URL is taken from the DETERMINISTIC page-markup discovery, never from the
 * language model's guessed image field — an og:image tag is a real, operator-
 * published URL, not a hallucination. If the page exposes no usable image we
 * return null and the caller falls back to branded category art (never a fake).
 */
export interface SourcePreviewImage {
  /** Absolute https URL of the operator's representative image. */
  url: string;
  /** Alt text found alongside the image on the source, when present. */
  altText: string | null;
  /** Host serving the image, for an honest "via {domain}" credit at render. */
  sourceDomain: string;
}

/**
 * Choose the best representative preview image from deterministic discovery.
 *
 * Only `primary` candidates qualify — a sponsor logo is exactly the flat,
 * boring artwork we are trying to move past, and never stands in for the prize.
 * https is required: an http image is mixed-content-blocked on the https listing
 * page, so persisting one would render nothing. Candidates arrive already scored
 * and sorted best-first by `discoverImageCandidates`, and every candidate has
 * already cleared that module's junk/tracking/threshold filters.
 */
export function selectSourcePreviewImage(
  discovery: ImageCandidateDiscovery,
): SourcePreviewImage | null {
  for (const candidate of discovery.candidates) {
    if (candidate.role !== "primary") continue;
    let host: string;
    try {
      const parsed = new URL(candidate.url);
      if (parsed.protocol !== "https:") continue;
      host = parsed.hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!host) continue;
    return {
      url: candidate.url,
      altText: candidate.altText,
      sourceDomain: host,
    };
  }
  return null;
}
