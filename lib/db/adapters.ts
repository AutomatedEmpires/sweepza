// Pure adapters mapping canonical Supabase row shapes (lib/db/types.ts) to the
// presentational UI shapes the cards/pages consume (lib/types/listing.ts and
// lib/mock/winners.ts). No I/O and no secrets -- safe to unit test and to call
// from server components once live data is wired. The DB-access layer
// (lib/db/*) is responsible for the joins (host, tags, winner author,
// reactions); these functions only translate already-fetched rows.
//
// Why this exists: the UI types use camelCase, require non-null entryUrl and
// endDate, embed host data, expect display-string prize categories, and carry
// derived flags (isBoosted, winnerReported) that the listing row does not
// return directly. Centralizing the translation makes the eventual
// mock -> Supabase swap a one-liner at each call site. See
// "Sweepza -- Cross-App Alignment Audit".

import type {
  EntryFrequency,
  Listing,
  ListingHost,
  PrizeCategory,
  SourceLabel,
} from "@/lib/types/listing";
import type { WinnerPost } from "@/lib/mock/winners";
import type { ReactionType } from "./enums";
import type {
  HostPublicRow,
  ListingRow,
  WinnerPostRow,
  WinnerReactionRow,
} from "./types";

/** null -> undefined, so optional UI fields stay truly optional. */
function opt<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

// --- Taxonomy: DB category `code` <-> UI PrizeCategory display string --------
// Canonical source is the `category` dictionary (supabase seed_dictionaries).
// The UI PrizeCategory enum is a display-string projection and is intentionally
// narrower: `experiences` and `other` have no PrizeCategory and map to
// undefined (the card renders no prize-category chip). Tracked as audit
// Medium #4 -- reconcile UI PrizeCategory with the category dictionary.

export const CATEGORY_CODE_TO_PRIZE_CATEGORY: Record<string, PrizeCategory> = {
  cash: "Cash",
  gift_cards: "Gift Cards",
  travel: "Travel",
  vehicles: "Vehicles",
  electronics: "Electronics",
  outdoor: "Outdoor Gear",
  home: "Home Goods",
  food_beverage: "Food/Beverage",
  fashion_beauty: "Beauty/Fashion",
  family_kids: "Family/Kids",
  seasonal: "Seasonal/Holiday",
};

/** Reverse map for building DB filters from a UI category selection. */
export const PRIZE_CATEGORY_TO_CATEGORY_CODE = Object.fromEntries(
  Object.entries(CATEGORY_CODE_TO_PRIZE_CATEGORY).map(([code, label]) => [
    label,
    code,
  ]),
) as Record<PrizeCategory, string>;

export function prizeCategoryFromCode(
  code: string | null | undefined,
): PrizeCategory | undefined {
  if (!code) return undefined;
  return CATEGORY_CODE_TO_PRIZE_CATEGORY[code];
}

// --- Host --------------------------------------------------------------------

export function toListingHost(row: HostPublicRow): ListingHost {
  return {
    id: row.id,
    name: row.display_name,
    logoUrl: opt(row.logo_url),
    verificationStatus: row.verification_status,
  };
}

// --- Listing -----------------------------------------------------------------

export interface ListingAdapterContext {
  /** Public host projection for `host_id`, already fetched by the caller. */
  host?: HostPublicRow | null;
  /** Tag display labels (resolved from listing_tag.tag_code -> tag.label). */
  tagLabels?: string[];
  /** True when an active boost/featured boost row exists for this listing. */
  isBoosted?: boolean;
  /** True when a published winner_post references this listing. */
  winnerReported?: boolean;
}

/**
 * Map a `listing` row (+ joined context) to the canonical UI `Listing`.
 *
 * Null-handling notes:
 * - `entryUrl`/`endDate` are required by the UI type; a row missing them yields
 *   an empty string. RLS + the publish quality gate make this unreachable for
 *   active Discover listings, but the empty string keeps the type honest rather
 *   than crashing the render.
 * - `entryFrequency` falls back to "other" when null.
 */
export function toListing(
  row: ListingRow,
  ctx: ListingAdapterContext = {},
): Listing {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,

    prizeName: row.prize_name,
    prizeValue: opt(row.prize_value),
    prizeCurrency: opt(row.prize_currency),
    prizeCategory: prizeCategoryFromCode(row.prize_category),
    winnerCount: opt(row.winner_count),

    mainImageUrl: opt(row.main_image_url),
    imageAltText: opt(row.image_alt_text),
    categoryFallbackImageUrl: opt(row.category_fallback_image),

    entryUrl: row.entry_url ?? "",
    officialRulesUrl: opt(row.official_rules_url),
    startDate: opt(row.start_date),
    endDate: row.end_date ?? "",
    entryFrequency: (row.entry_frequency ?? "other") as EntryFrequency,
    entryLimitNotes: opt(row.entry_limit_notes),
    eligibilityCountry: opt(row.eligibility_country),
    eligibilityStates: opt(row.eligibility_states),
    ageRequirement: opt(row.age_requirement),

    sourceLabel: row.public_source_label as SourceLabel,
    originalSponsorName: opt(row.sponsor_name),
    host: ctx.host ? toListingHost(ctx.host) : undefined,

    lifecycleStatus: row.lifecycle_status,
    listingVerificationStatus: row.listing_verification_status,
    isFeatured: row.is_featured,
    isBoosted: ctx.isBoosted,
    publishedAt: opt(row.published_at),
    winnerReported: ctx.winnerReported,

    tags: ctx.tagLabels,
  };
}

// --- Winner Wall -------------------------------------------------------------

/** Aggregate raw reaction rows into per-type counts for the Winner Wall. */
export function aggregateReactions(
  rows: WinnerReactionRow[],
): Partial<Record<ReactionType, number>> {
  const counts: Partial<Record<ReactionType, number>> = {};
  for (const r of rows) {
    counts[r.reaction_type] = (counts[r.reaction_type] ?? 0) + 1;
  }
  return counts;
}

export interface WinnerPostAdapterContext {
  /** Display name resolved from the winner's app_user row. */
  winnerDisplayName: string;
  /** Slug of the attached listing (resolved from listing_id). */
  listingSlug: string;
  /** Either raw reaction rows (aggregated here) or pre-aggregated counts. */
  reactions?: WinnerReactionRow[] | Partial<Record<ReactionType, number>>;
}

export function toWinnerPost(
  row: WinnerPostRow,
  ctx: WinnerPostAdapterContext,
): WinnerPost {
  const reactions = Array.isArray(ctx.reactions)
    ? aggregateReactions(ctx.reactions)
    : ctx.reactions ?? {};

  return {
    id: row.id,
    winnerDisplayName: ctx.winnerDisplayName,
    caption: row.caption ?? "",
    photoUrl: opt(row.photo_url),
    listingSlug: ctx.listingSlug,
    verifiedWin: row.verified_win,
    reviewStatus: row.review_status,
    reactions,
    createdAt: row.created_at,
  };
}
