import { isRetryableOnLaterRun, type SourceHttpClient } from "@/lib/ingestion/http";
import type {
  ImageCandidate,
  ImageCandidateDiscovery,
  ImageExtractionMethod,
  ImageRightsEvidence,
} from "@/lib/ingestion/image-candidates";
import {
  validateImageAsset,
  type ValidatedImageAsset,
} from "@/lib/ingestion/image-validation";
import { listingFallbackImageUrl } from "@/lib/listing-media";

export interface ListingMediaStoragePort {
  store(asset: ValidatedImageAsset): Promise<{
    storedUrl: string;
    objectPath: string;
    deduplicated: boolean;
  }>;
}

export interface ImageCandidateDiagnostic {
  url: string;
  method: ImageExtractionMethod;
  score: number;
  role: ImageCandidate["role"];
  rightsStatus: ImageRightsEvidence["status"];
  status:
    | "rejected"
    | "fetch_failed"
    | "validation_failed"
    | "storage_failed"
    | "selected";
  rejectionReason: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
  validation: {
    width: number;
    height: number;
    mimeType: string;
    byteSize: number;
    contentHash: string;
  } | null;
  storageStatus: "not_attempted" | "stored" | "deduplicated" | "failed";
}

export interface SelectedListingImage {
  imageStatus: "source_image" | "sponsor_asset";
  originalUrl: string;
  finalSourceUrl: string;
  storedUrl: string;
  objectPath: string;
  sourceDomain: string;
  method: ImageExtractionMethod;
  altText: string;
  attribution: string | null;
  licenseUrl: string | null;
  rightsStatus: "permitted" | "authorized";
  rightsReason: string;
  retrievedAt: string;
  width: number;
  height: number;
  aspectRatio: number;
  mimeType: string;
  byteSize: number;
  contentHash: string;
}

export type ListingImagePipelineResult =
  | {
      finalStatus: "source_image" | "sponsor_asset";
      selected: SelectedListingImage;
      fallbackUrl: null;
      diagnostics: ImageCandidateDiagnostic[];
      retryable: false;
    }
  | {
      finalStatus: "generated_fallback";
      selected: null;
      fallbackUrl: string;
      diagnostics: ImageCandidateDiagnostic[];
      retryable: boolean;
    };

function diagnostic(
  candidate: ImageCandidate,
  values: Partial<ImageCandidateDiagnostic>,
): ImageCandidateDiagnostic {
  return {
    url: candidate.url,
    method: candidate.method,
    score: candidate.score,
    role: candidate.role,
    rightsStatus: candidate.rights.status,
    status: "rejected",
    rejectionReason: null,
    httpStatus: null,
    finalUrl: null,
    validation: null,
    storageStatus: "not_attempted",
    ...values,
  };
}

/**
 * Validate and persist the best rights-cleared candidate. Unknown rights fail
 * closed: discovering an OG image or observing permissive CORS is not a reuse
 * license. A host/operator can explicitly authorize exact URLs at this port.
 */
export async function processListingImage(input: {
  discovery: ImageCandidateDiscovery;
  prizeCategory: string | null;
  prizeName: string;
  http: SourceHttpClient;
  storage: ListingMediaStoragePort;
  authorizedUrls?: ReadonlySet<string>;
  authorizedAttribution?: string | null;
  maxCandidates?: number;
}): Promise<ListingImagePipelineResult> {
  const diagnostics: ImageCandidateDiagnostic[] = input.discovery.rejected.map((candidate) => ({
    url: candidate.url,
    method: candidate.method,
    score: candidate.score,
    role: "primary",
    rightsStatus: "unknown",
    status: "rejected",
    rejectionReason: candidate.reasons.join(","),
    httpStatus: null,
    finalUrl: null,
    validation: null,
    storageStatus: "not_attempted",
  }));

  // The hierarchy is semantic before numerical: exhaust prize/sweep images,
  // then try a sponsor logo. A high-scoring logo never displaces a real prize.
  const ordered = [...input.discovery.candidates].sort((a, b) => {
    if (a.role !== b.role) return a.role === "primary" ? -1 : 1;
    return b.score - a.score;
  });
  const limit = Math.max(1, Math.min(12, input.maxCandidates ?? 8));
  let attempted = 0;
  let retryable = false;

  for (const candidate of ordered) {
    const explicitlyAuthorized = input.authorizedUrls?.has(candidate.url) ?? false;
    if (!explicitlyAuthorized && candidate.rights.status !== "permitted") {
      diagnostics.push(diagnostic(candidate, {
        rejectionReason:
          candidate.rights.status === "restricted"
            ? "rights_restricted"
            : "rights_unconfirmed",
      }));
      continue;
    }

    attempted += 1;
    if (attempted > limit) {
      diagnostics.push(diagnostic(candidate, { rejectionReason: "candidate_attempt_limit" }));
      continue;
    }

    const fetched = await input.http.getAsset(candidate.url);
    if (fetched.status === "failed") {
      if (isRetryableOnLaterRun(fetched.failure)) {
        retryable = true;
      }
      diagnostics.push(diagnostic(candidate, {
        status: "fetch_failed",
        rejectionReason: fetched.failure,
        httpStatus: fetched.httpStatus,
      }));
      continue;
    }

    if (
      explicitlyAuthorized
      && fetched.finalUrl !== candidate.url
      && !input.authorizedUrls?.has(fetched.finalUrl)
    ) {
      diagnostics.push(diagnostic(candidate, {
        status: "rejected",
        rejectionReason: "authorized_redirect_target_not_approved",
        httpStatus: fetched.httpStatus,
        finalUrl: fetched.finalUrl,
      }));
      continue;
    }

    const validation = await validateImageAsset({
      bytes: fetched.bytes,
      contentType: fetched.contentType,
      role: candidate.role,
    });
    if (!validation.ok) {
      diagnostics.push(diagnostic(candidate, {
        status: "validation_failed",
        rejectionReason: validation.failure,
        httpStatus: fetched.httpStatus,
        finalUrl: fetched.finalUrl,
      }));
      continue;
    }

    let stored: Awaited<ReturnType<ListingMediaStoragePort["store"]>>;
    try {
      stored = await input.storage.store(validation.asset);
    } catch (error) {
      retryable = true;
      diagnostics.push(diagnostic(candidate, {
        status: "storage_failed",
        rejectionReason: error instanceof Error ? error.message.slice(0, 300) : "storage_failed",
        httpStatus: fetched.httpStatus,
        finalUrl: fetched.finalUrl,
        validation: {
          width: validation.asset.width,
          height: validation.asset.height,
          mimeType: validation.asset.mimeType,
          byteSize: validation.asset.byteSize,
          contentHash: validation.asset.contentHash,
        },
        storageStatus: "failed",
      }));
      continue;
    }

    const selectedDiagnostic = diagnostic(candidate, {
      status: "selected",
      httpStatus: fetched.httpStatus,
      finalUrl: fetched.finalUrl,
      validation: {
        width: validation.asset.width,
        height: validation.asset.height,
        mimeType: validation.asset.mimeType,
        byteSize: validation.asset.byteSize,
        contentHash: validation.asset.contentHash,
      },
      storageStatus: stored.deduplicated ? "deduplicated" : "stored",
    });
    diagnostics.push(selectedDiagnostic);

    const sourceDomain = new URL(fetched.finalUrl).hostname.toLowerCase();
    const imageStatus = candidate.role === "sponsor_logo" ? "sponsor_asset" : "source_image";
    return {
      finalStatus: imageStatus,
      fallbackUrl: null,
      diagnostics,
      retryable: false,
      selected: {
        imageStatus,
        originalUrl: candidate.url,
        finalSourceUrl: fetched.finalUrl,
        storedUrl: stored.storedUrl,
        objectPath: stored.objectPath,
        sourceDomain,
        method: candidate.method,
        altText: candidate.altText ?? input.prizeName,
        attribution:
          (explicitlyAuthorized ? input.authorizedAttribution : null)
          ?? candidate.rights.attribution,
        licenseUrl: candidate.rights.licenseUrl,
        rightsStatus: explicitlyAuthorized ? "authorized" : "permitted",
        rightsReason: explicitlyAuthorized
          ? "exact image URL authorized by a host or operator"
          : candidate.rights.reason,
        retrievedAt: new Date().toISOString(),
        width: validation.asset.width,
        height: validation.asset.height,
        aspectRatio: validation.asset.aspectRatio,
        mimeType: validation.asset.mimeType,
        byteSize: validation.asset.byteSize,
        contentHash: validation.asset.contentHash,
      },
    };
  }

  return {
    finalStatus: "generated_fallback",
    selected: null,
    fallbackUrl: listingFallbackImageUrl(input.prizeCategory),
    diagnostics,
    retryable,
  };
}
