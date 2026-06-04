"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/icon";
import { ListingBadge } from "@/components/listing-badge";
import { track } from "@/lib/analytics";
import {
  SOURCE_LABEL_TEXT,
  computeBadges,
  daysUntil,
  isExpired,
} from "@/lib/listing-badges";
import { useSeekerState } from "@/lib/seeker-state";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

const MAX_CARD_BADGES = 3;

// Canonical discovery surfaces for analytics (scroll/swipe/detail). Undefined
// means a non-discovery context (e.g. the seeker dashboard) where a view event
// should not fire.
export type CardSurface = "scroll" | "swipe" | "detail";

const ENTRY_FREQUENCY_LABEL: Record<Listing["entryFrequency"], string> = {
  one_time: "One-time entry",
  daily: "Daily entry",
  weekly: "Weekly entry",
  monthly: "Monthly entry",
  instant_win: "Instant win",
  other: "See rules",
};

function formatEndDate(endDate: string): string {
  return new Date(endDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function endDateLabel(listing: Listing): string {
  if (isExpired(listing)) return `Ended ${formatEndDate(listing.endDate)}`;
  const days = daysUntil(listing.endDate);
  if (days <= 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  if (days <= 14) return `Ends in ${days} days`;
  return `Ends ${formatEndDate(listing.endDate)}`;
}

function formatPrizeValue(value?: number, currency = "USD"): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value}`;
  }
}

export function ListingCard({
  listing,
  surface,
}: {
  listing: Listing;
  surface?: CardSurface;
}) {
  const store = useSeekerState();
  const expired = isExpired(listing);
  const initialState: SeekerUiState =
    listing.seekerState?.primaryUiState ?? "none";

  // Falls back to local state when no seeker-state provider is mounted.
  const [localState, setLocalState] = useState<SeekerUiState>(initialState);
  const [localSaved, setLocalSaved] = useState(initialState === "saved");

  const uiState = store ? store.getState(listing.id) ?? initialState : localState;
  const saved = store ? store.isSaved(listing.id) : localSaved;

  const baseProps = useMemo(
    () => ({
      listing_id: listing.id,
      source_label: listing.sourceLabel,
      ...(surface ? { surface } : {}),
    }),
    [listing.id, listing.sourceLabel, surface],
  );

  useEffect(() => {
    if (surface) track("listing_viewed", { ...baseProps, category: listing.prizeCategory });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPrimary(next: SeekerUiState) {
    if (store) store.setPrimaryState(listing.id, next);
    else setLocalState(next);
  }

  function toggleSaved() {
    const willSave = !saved;
    if (store) store.toggleSaved(listing.id);
    else setLocalSaved(willSave);
    if (willSave) track("listing_saved", baseProps);
  }

  function handleEnter() {
    if (expired || uiState === "won") return;
    track("listing_enter_clicked", baseProps);
    if (typeof window !== "undefined") {
      window.open(listing.entryUrl, "_blank", "noopener,noreferrer");
    }
    setPrimary("entered");
    track("listing_marked_entered", { listing_id: listing.id });
  }

  function handleSkip() {
    const next = uiState === "skipped" ? "none" : "skipped";
    setPrimary(next);
    if (next === "skipped") track("listing_skipped", baseProps);
  }

  function handleShare() {
    track("listing_shared", { ...baseProps, share_type: "link" });
  }

  const badges = useMemo(
    () => computeBadges(listing).slice(0, MAX_CARD_BADGES),
    [listing],
  );
  const prizeValue = formatPrizeValue(listing.prizeValue, listing.prizeCurrency);
  const imageUrl = listing.mainImageUrl ?? listing.categoryFallbackImageUrl;
  const sourceText = SOURCE_LABEL_TEXT[listing.sourceLabel];
  const hostVerified =
    listing.host?.verificationStatus === "self_verified" ||
    listing.host?.verificationStatus === "admin_verified";

  const entered = uiState === "entered";
  const won = uiState === "won";
  const skipped = uiState === "skipped";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-card border border-sand bg-white shadow-sm",
        expired && "opacity-70",
      )}
    >
      {/* Image zone */}
      <div className="relative aspect-[4/3] w-full bg-sand">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={listing.imageAltText ?? listing.prizeName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink/30">
            <Icon name="gift" size={48} />
          </div>
        )}

        {badges.length > 0 && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 pr-12">
            {badges.map((badge) => (
              <ListingBadge key={badge.id} badge={badge} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={toggleSaved}
          aria-pressed={saved}
          aria-label={saved ? "Saved" : "Save listing"}
          className={cn(
            "absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full backdrop-blur transition",
            saved ? "bg-ember text-cream" : "bg-cream/90 text-ink",
          )}
        >
          <Icon name="bookmark" size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        {/* Host identity zone */}
        <div className="flex items-center gap-2">
          {listing.host?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.host.logoUrl}
              alt={listing.host.name}
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-sand text-[10px] font-bold text-ink/60">
              {(listing.host?.name ?? "Sweepza").charAt(0)}
            </span>
          )}
          <span className="truncate text-xs font-medium text-ink/70">
            {listing.host?.name ?? sourceText}
          </span>
          {hostVerified && (
            <Icon name="verified" size={14} className="shrink-0 text-sky" />
          )}
          <span className="ml-auto whitespace-nowrap text-[11px] font-medium text-ink/45">
            {sourceText}
          </span>
        </div>

        {/* Prize / title zone */}
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-ink">
            {listing.title}
          </h3>
          {prizeValue && (
            <p className="text-sm font-semibold text-ember">{prizeValue} value</p>
          )}
          <p className="line-clamp-2 text-sm text-ink/60">
            {listing.shortDescription}
          </p>
        </div>

        {/* Rules snapshot zone */}
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink/70">
          <div className="inline-flex items-center gap-1.5">
            <Icon name="calendar" size={14} className="text-ink/40" />
            <span>{endDateLabel(listing)}</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <Icon name="repeat" size={14} className="text-ink/40" />
            <span>{ENTRY_FREQUENCY_LABEL[listing.entryFrequency]}</span>
          </div>
          {listing.eligibilityCountry && (
            <div className="inline-flex items-center gap-1.5">
              <Icon name="location" size={14} className="text-ink/40" />
              <span>
                {listing.eligibilityCountry}
                {listing.ageRequirement ? ` \u00b7 ${listing.ageRequirement}+` : ""}
              </span>
            </div>
          )}
        </dl>

        {/* Action zone */}
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={handleEnter}
            disabled={expired}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition",
              expired
                ? "cursor-not-allowed bg-ink/10 text-ink/40"
                : won
                  ? "bg-moss text-cream"
                  : entered
                    ? "bg-moss/15 text-moss"
                    : "bg-ember text-cream hover:bg-ember/90",
            )}
          >
            {expired ? (
              "Expired"
            ) : won ? (
              <>
                <Icon name="trophy" size={16} /> Won
              </>
            ) : entered ? (
              <>
                <Icon name="check" size={16} /> Entered
              </>
            ) : (
              "Enter"
            )}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            aria-pressed={skipped}
            aria-label="Skip listing"
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full border border-sand text-ink/60 transition",
              skipped && "bg-ink/5 text-ink",
            )}
          >
            <Icon name="skip" size={18} />
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share listing"
            className="grid h-10 w-10 place-items-center rounded-full border border-sand text-ink/60 transition hover:bg-ink/5"
          >
            <Icon name="share" size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
