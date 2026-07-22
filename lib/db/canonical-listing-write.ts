import "server-only";

import type { EntryFrequency } from "@/lib/db/enums";
import {
  dedupKeys,
  stableHash,
} from "@/lib/ingestion/fingerprint";
import type { NormalizedCandidate } from "@/lib/ingestion/mapper";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface CanonicalListingWriteInput {
  title: string;
  shortDescription: string;
  longDescription?: string | null;
  prizeName: string;
  prizeValue?: number | null;
  prizeCategory: string;
  winnerCount?: number | null;
  mainImageUrl?: string | null;
  imageAltText?: string | null;
  entryUrl: string;
  officialRulesUrl: string;
  startDate?: string | null;
  endDate: string;
  entryFrequency: EntryFrequency;
  entryLimitNotes?: string | null;
  eligibilityCountry: string;
  eligibilityStates: string[];
  ageRequirement: number;
  noPurchaseNecessary: true;
  sponsorName: string;
  sponsorUrl?: string | null;
  tagCodes: string[];
}

export type CanonicalListingOrigin =
  | {
      kind: "admin_official";
      actorAppUserId: string;
      publish: boolean;
      verified: boolean;
    }
  | {
      kind: "host_submission";
      actorAppUserId: string;
      hostId: string;
    };

export interface CanonicalListingWriteResult {
  id: string;
  slug: string;
  published: boolean;
}

export class CanonicalListingConflictError extends Error {
  readonly code = "canonical_listing_conflict";

  constructor(
    message: string,
    readonly listingId: string,
  ) {
    super(message);
    this.name = "CanonicalListingConflictError";
  }
}

async function assertControlledValues(
  prizeCategory: string,
  tagCodes: string[],
): Promise<void> {
  const supabase = createServiceRoleClient();
  const categoryTask = supabase
    .from("category")
    .select("code")
    .eq("code", prizeCategory)
    .eq("is_active", true)
    .maybeSingle<{ code: string }>();
  const tagTask =
    tagCodes.length === 0
      ? Promise.resolve({ data: [] as Array<{ code: string }>, error: null })
      : supabase
          .from("tag")
          .select("code")
          .in("code", tagCodes)
          .eq("is_active", true)
          .returns<Array<{ code: string }>>();

  const [category, tags] = await Promise.all([categoryTask, tagTask]);
  if (category.error) {
    throw new Error(`Category validation failed: ${category.error.message}`);
  }
  if (!category.data) {
    throw new Error("Prize category is not an active controlled value.");
  }
  if (tags.error) {
    throw new Error(`Tag validation failed: ${tags.error.message}`);
  }
  const uniqueRequestedTags = [...new Set(tagCodes)];
  if ((tags.data ?? []).length !== uniqueRequestedTags.length) {
    throw new Error("One or more tags are not active controlled values.");
  }
}

function toCandidate(input: CanonicalListingWriteInput): NormalizedCandidate {
  const eligibilityStates =
    input.eligibilityStates.length > 0
      ? [...new Set(input.eligibilityStates.map((state) => state.toUpperCase()))]
      : [];
  const identity = dedupKeys({
    officialRulesUrl: input.officialRulesUrl,
    entryUrl: input.entryUrl,
    sponsorName: input.sponsorName,
    prizeName: input.prizeName,
    endDate: input.endDate,
    eligibilityCountry: input.eligibilityCountry,
    eligibilityStates,
  });

  return {
    title: input.title.trim(),
    shortDescription: input.shortDescription.trim(),
    longDescription: input.longDescription?.trim() || null,
    prizeName: input.prizeName.trim(),
    prizeValue: input.prizeValue ?? null,
    prizeCategory: input.prizeCategory,
    // Preserve validated navigable URLs exactly. Normalized URL keys are
    // identity-only and must not rewrite a sponsor's destination.
    entryUrl: input.entryUrl.trim(),
    officialRulesUrl: input.officialRulesUrl.trim(),
    startDate: input.startDate ?? null,
    endDate: input.endDate,
    entryFrequency: input.entryFrequency,
    eligibilityCountry: input.eligibilityCountry.trim().toUpperCase(),
    eligibilityStates,
    ageRequirement: input.ageRequirement,
    noPurchaseNecessary: input.noPurchaseNecessary,
    sponsorName: input.sponsorName.trim(),
    sponsorUrl: input.sponsorUrl?.trim() || null,
    mainImageUrl: input.mainImageUrl?.trim() || null,
    imageAltText: input.imageAltText?.trim() || null,
    dedup: identity,
  };
}

/**
 * Canonical create boundary for authenticated admin and host submissions.
 * Identity/provenance is claimed by the same database RPC as ingestion. A
 * duplicate never creates a second public listing, and publication is the final
 * step after controlled values and tags are safely attached.
 */
export async function createCanonicalListing(
  input: CanonicalListingWriteInput,
  origin: CanonicalListingOrigin,
): Promise<CanonicalListingWriteResult> {
  await assertControlledValues(input.prizeCategory, input.tagCodes);
  const candidate = toCandidate(input);
  const source =
    origin.kind === "admin_official"
      ? "admin_official_manual"
      : "authenticated_host_submission";
  const provenance = {
    officialUrlKey: candidate.dedup.urlKey,
    contentFingerprint: candidate.dedup.contentKey,
    variantKey: candidate.dedup.variantKey,
    discoverySource: source,
    officialSourceUrl: input.officialRulesUrl,
    extractionConfidence: null,
    extractionFactors: null,
    extractionSummary:
      origin.kind === "admin_official"
        ? "Official-source facts entered by an authenticated Sweepza operator."
        : "Facts and official-rules URL supplied by an authenticated host; authority remains pending review.",
    contentHash: stableHash(
      JSON.stringify({
        candidate,
        winnerCount: input.winnerCount ?? null,
        entryLimitNotes: input.entryLimitNotes?.trim() || null,
        tagCodes: [...new Set(input.tagCodes)].sort(),
        originKind: origin.kind,
      }),
    ),
  };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("create_canonical_listing", {
    p_candidate: candidate,
    p_provenance: provenance,
    p_write: {
      kind: origin.kind,
      actorAppUserId: origin.actorAppUserId,
      hostId: origin.kind === "host_submission" ? origin.hostId : null,
      publish: origin.kind === "admin_official" ? origin.publish : false,
      verified: origin.kind === "admin_official" ? origin.verified : false,
      winnerCount: input.winnerCount ?? null,
      entryLimitNotes: input.entryLimitNotes?.trim() || null,
    },
    p_tag_codes: [...new Set(input.tagCodes)],
  });
  if (error) {
    throw new Error(`Canonical listing transaction failed: ${error.message}`);
  }
  const result = data as {
    listing_id?: string;
    slug?: string | null;
    created?: boolean;
    idempotent?: boolean;
    published?: boolean;
    suspected_duplicate_ids?: string[];
  } | null;
  if (!result?.listing_id) {
    throw new Error("Canonical listing transaction returned no listing id.");
  }
  if (!result.created && !result.idempotent) {
    throw new CanonicalListingConflictError(
      "A listing with the same official source and promotion cycle already exists.",
      result.listing_id,
    );
  }
  if ((result.suspected_duplicate_ids?.length ?? 0) > 0) {
    throw new CanonicalListingConflictError(
      "Potential duplicate evidence requires review before this listing can publish.",
      result.listing_id,
    );
  }
  if (!result.slug) {
    throw new Error("Canonical listing transaction returned no slug.");
  }
  return {
    id: result.listing_id,
    slug: result.slug,
    published: result.published === true,
  };
}
