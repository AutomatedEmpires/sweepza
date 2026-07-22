import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import type { ImageCandidateRole } from "@/lib/ingestion/image-candidates";

export type StoredImageFormat = "jpeg" | "png" | "webp" | "gif" | "avif";

export type ImageValidationFailure =
  | "empty_asset"
  | "asset_too_large"
  | "missing_or_invalid_content_type"
  | "malformed_image"
  | "unsupported_format"
  | "content_type_mismatch"
  | "dimensions_too_small"
  | "dimensions_too_large"
  | "suspicious_aspect_ratio"
  | "mostly_transparent"
  | "animated_image";

export type ImageValidationResult =
  | {
      ok: true;
      asset: ValidatedImageAsset;
    }
  | {
      ok: false;
      failure: ImageValidationFailure;
      message: string;
    };

export interface ValidatedImageAsset {
  bytes: Uint8Array;
  format: StoredImageFormat;
  mimeType: string;
  width: number;
  height: number;
  aspectRatio: number;
  byteSize: number;
  contentHash: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

const MIME_BY_FORMAT: Record<StoredImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

function normalizeClaimedMime(value: string | null | undefined): string | null {
  const mime = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!mime || !mime.startsWith("image/")) return null;
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

function normalizeFormat(
  format: string | undefined,
  claimedMime: string,
): StoredImageFormat | null {
  if (format === "jpeg" || format === "png" || format === "webp" || format === "gif") {
    return format;
  }
  // libvips reports AVIF as HEIF. The response MIME disambiguates it from
  // other HEIF variants, which are not accepted by the current web stack.
  if (format === "heif" && claimedMime === "image/avif") return "avif";
  return null;
}

export async function validateImageAsset(input: {
  bytes: Uint8Array;
  contentType: string | null;
  role?: ImageCandidateRole;
  maxBytes?: number;
}): Promise<ImageValidationResult> {
  const byteSize = input.bytes.byteLength;
  if (byteSize === 0) {
    return { ok: false, failure: "empty_asset", message: "image response was empty" };
  }
  const maxBytes = Math.min(MAX_BYTES, Math.max(1, input.maxBytes ?? MAX_BYTES));
  if (byteSize > maxBytes) {
    return {
      ok: false,
      failure: "asset_too_large",
      message: `image is ${byteSize} bytes; limit is ${maxBytes}`,
    };
  }

  const claimedMime = normalizeClaimedMime(input.contentType);
  if (!claimedMime) {
    return {
      ok: false,
      failure: "missing_or_invalid_content_type",
      message: `expected an image content type, received ${input.contentType ?? "none"}`,
    };
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input.bytes, {
      failOn: "warning",
      limitInputPixels: MAX_PIXELS,
      unlimited: false,
    }).metadata();
  } catch (error) {
    return {
      ok: false,
      failure: "malformed_image",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const format = normalizeFormat(metadata.format, claimedMime);
  if (!format) {
    return {
      ok: false,
      failure: "unsupported_format",
      message: `detected image format ${metadata.format ?? "unknown"} is unsupported`,
    };
  }
  const expectedMime = MIME_BY_FORMAT[format];
  if (claimedMime !== expectedMime) {
    return {
      ok: false,
      failure: "content_type_mismatch",
      message: `response claims ${claimedMime}, but bytes decode as ${expectedMime}`,
    };
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const role = input.role ?? "primary";
  const minWidth = role === "sponsor_logo" ? 160 : 480;
  const minHeight = role === "sponsor_logo" ? 80 : 240;
  if (width < minWidth || height < minHeight) {
    return {
      ok: false,
      failure: "dimensions_too_small",
      message: `${width}x${height} is below the ${minWidth}x${minHeight} minimum for ${role}`,
    };
  }
  if (width * height > MAX_PIXELS) {
    return {
      ok: false,
      failure: "dimensions_too_large",
      message: `${width}x${height} exceeds the ${MAX_PIXELS}-pixel decode limit`,
    };
  }

  const aspectRatio = width / height;
  const minRatio = role === "sponsor_logo" ? 0.3 : 0.45;
  const maxRatio = role === "sponsor_logo" ? 6 : 3.5;
  if (aspectRatio < minRatio || aspectRatio > maxRatio) {
    return {
      ok: false,
      failure: "suspicious_aspect_ratio",
      message: `${aspectRatio.toFixed(3)} is outside the accepted ${role} aspect range`,
    };
  }

  if ((metadata.pages ?? 1) > 1) {
    return {
      ok: false,
      failure: "animated_image",
      message: "animated images are not accepted for listing media",
    };
  }

  // metadata() parses headers without proving that the complete pixel stream
  // is valid. Force one bounded decode so truncated/corrupt assets cannot be
  // persisted merely because their dimensions were readable.
  try {
    const decoded = await sharp(input.bytes, {
      failOn: "warning",
      limitInputPixels: MAX_PIXELS,
      sequentialRead: true,
      unlimited: false,
    }).ensureAlpha().stats();
    const alphaMean = decoded.channels.at(-1)?.mean ?? 255;
    if (alphaMean / 255 < 0.01) {
      return {
        ok: false,
        failure: "mostly_transparent",
        message: "decoded image opacity is below the 1% visibility threshold",
      };
    }
  } catch (error) {
    return {
      ok: false,
      failure: "malformed_image",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: true,
    asset: {
      bytes: input.bytes,
      format,
      mimeType: expectedMime,
      width,
      height,
      aspectRatio,
      byteSize,
      contentHash: createHash("sha256").update(input.bytes).digest("hex"),
    },
  };
}

export function listingMediaObjectPath(asset: Pick<ValidatedImageAsset, "contentHash" | "format">): string {
  const extension = asset.format === "jpeg" ? "jpg" : asset.format;
  return `sha256/${asset.contentHash.slice(0, 2)}/${asset.contentHash}.${extension}`;
}
