"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { canOptimizeImage } from "@/lib/image";
import { Icon } from "@/components/icon";
import { ListingBadge } from "@/components/listing-badge";
import { track } from "@/lib/analytics";
import {
  SOURCE_LABEL_TEXT,
  computeBadges,
  daysUntil,
  isExpired,
} from "@/lib/listing-badges";
import { formatEndDate, formatPrizeValue } from "@/lib/listing-format";
import { useNow } from "@/lib/now";
import { useSeekerState } from "@/lib/seeker-state";
import { listingShareUrl, shareLink } from "@/lib/share";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

const MAX_CARD_BADGES = 3;

// Canonical discovery surfaces for analytics (scroll/swipe/detail). Undefined
// means a non-discovery context (e.g. the seeker dashboard) where a view event
// should not fire.
export type CardSurface = "scroll" | "swipe" | "detail";

function countdownLabel(listing: Listing, now: Date): string {
  if (isExpired(listing, now)) return "Ended";
  const days = daysUntil(listing.endDate, now);
  if (days <= 0) return "Ends today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function ListingCard({
  listing,
  surface,
}: {
  listing: Listing;
  surface?: CardSurface;
}) {
  const store = useSeekerState();
  const now = useNow();
  const expired = isExpired(listing, now);
  const initialState: SeekerUiState =
    listing.seekerState?.primaryUiState ?? "none";

  // Falls back to local state when no seeker-state provider is mounted.
  const [localState, setLocalState] = useState<SeekerUiState>(initialState);
  const [localSaved, setLocalSaved] = useState(initialState === "saved");
  const [shareFlash, setShareFlash] = useState(false);

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

  async function handleShare() {
    const outcome = await shareLink({
      title: listing.title,
      url: listingShareUrl(listing.slug),
    });
    if (outcome === "dismissed" || outcome === "failed") return;
    track("listing_shared", { ...baseProps, share_type: outcome === "shared" ? "native" : "link" });
    if (outcome === "copied") {
      setShareFlash(true);
      window.setTimeout(() => setShareFlash(false), 1600);
    }
  }

  const badges = useMemo(
    () => computeBadges(listing, now).slice(0, MAX_CARD_BADGES),
    [listing, now],
  );
  const prizeValue = formatPrizeValue(listing.prizeValue, listing.prizeCurrency);
  const imageUrl = listing.mainImageUrl ?? listing.categoryFallbackImageUrl;
  const sourceText = SOURCE_LABEL_TEXT[listing.sourceLabel];
  // Attribution name: claimed host first, then the original sponsor for
  // Sweepza-found listings. When neither exists the source label stands alone.
  const attributionName = listing.host?.name ?? listing.originalSponsorName;
  const hostName = attributionName ?? sourceText;
  const hostVerified =
    listing.host?.verificationStatus === "self_verified" ||
    listing.host?.verificationStatus === "admin_verified";

  const entered = uiState === "entered";
  const won = uiState === "won";
  const skipped = uiState === "skipped";

  const startLabel = listing.startDate ? formatEndDate(listing.startDate) : "—";
  const endLabel = formatEndDate(listing.endDate);
  const countdown = countdownLabel(listing, now);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-card border border-sand bg-cream shadow-sm",
        expired && "opacity-70",
      )}
    >
      {/* Hero photo + overlays */}
      <div className="relative aspect-[4/3] w-full bg-sand">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={listing.imageAltText ?? listing.prizeName}
            fill
            className="object-cover"
            sizes="(min-width: 1536px) 320px, (min-width: 1024px) 480px, 100vw"
            unoptimized={!canOptimizeImage(imageUrl)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink/30">
            <Icon name="gift" size={48} />
          </div>
        )}

        {/* Host seal */}
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-cream/90 py-0.5 pl-0.5 pr-2 shadow-sm backdrop-blur">
          {listing.host?.logoUrl ? (
            <Image
              src={listing.host.logoUrl}
              alt={listing.host.name}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover"
              unoptimized={!canOptimizeImage(listing.host.logoUrl)}
            />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-sand text-[10px] font-bold text-ink/60">
              {hostName.charAt(0)}
            </span>
          )}
          {hostVerified && (
            <Icon name="verified" size={13} className="text-moss" />
          )}
        </div>

        {/* Category ribbon */}
        {listing.prizeCategory && (
          <span className="absolute left-1/2 top-3 -translate-x-1/2 -rotate-1 rounded-md bg-moss px-3 py-1 font-display text-sm uppercase tracking-wide text-cream shadow-sm">
            {listing.prizeCategory}
          </span>
        )}

        {/* Save */}
        <button
          type="button"
          onClick={toggleSaved}
          aria-pressed={saved}
          aria-label={saved ? "Saved" : "Save listing"}
          className={cn(
            "absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full shadow-sm backdrop-blur transition",
            saved ? "bg-ember text-cream" : "bg-cream/90 text-ink",
          )}
        >
          <Icon name="bookmark" size={18} />
        </button>

        {/* Urgency / trust badges */}
        {badges.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 pr-3">
            {badges.map((badge) => (
              <ListingBadge key={badge.id} badge={badge} />
            ))}
          </div>
        )}
      </div>

      {/* Cream content panel with curved top edge */}
      <div className="relative -mt-4 rounded-t-[1.75rem] bg-cream px-4 pb-4 pt-4">
        <h3 className="font-display text-xl leading-tight text-ink">
          <Link
            href={`/sweeps/${listing.slug}`}
            className="line-clamp-2 decoration-moss decoration-2 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {listing.title}
          </Link>
        </h3>

        <p className="mt-0.5 truncate text-[11px] font-medium text-ink/60">
          {attributionName ? `${attributionName} · ${sourceText}` : sourceText}
        </p>

        {prizeValue && (
          <p className="mt-1 text-sm font-semibold text-ink">{prizeValue} value</p>
        )}
        <p className="mt-1 line-clamp-2 text-sm text-ink/60">
          {listing.shortDescription}
        </p>

        {/* Dashed divider with doodle */}
        <div className="relative my-3 flex items-center justify-center">
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-sand" />
          <span className="relative bg-cream px-2 text-moss">
            <Icon name="gift" size={15} />
          </span>
        </div>

        {/* Begins / Ends */}
        <div className="flex items-stretch text-center">
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/55">
              Begins
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-ink/70">
              <Icon name="calendar" size={13} className="text-ink/55" />
              {startLabel}
            </p>
          </div>
          <div className="mx-2 w-px bg-sand" />
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/55">
              Ends
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-ink/70">
              <Icon name="calendar" size={13} className="text-ink/55" />
              {endLabel}
            </p>
            <p
              className={cn(
                "text-[10px] font-semibold",
                expired ? "text-ink/55" : "text-ember",
              )}
            >
              {countdown}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleEnter}
            disabled={expired || won}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition",
              // Won outranks expired — the outcome is the seeker's permanent
              // record; that the sweepstake later ended is secondary.
              won
                ? "cursor-default bg-moss text-cream"
                : expired
                  ? "cursor-not-allowed bg-ink/10 text-ink/55"
                  : entered
                    ? "bg-moss/15 text-moss"
                    : "bg-moss text-cream hover:bg-moss/90",
            )}
          >
            {won ? (
              <>
                <Icon name="trophy" size={16} /> Won
              </>
            ) : expired ? (
              "Expired"
            ) : entered ? (
              <>
                <Icon name="check" size={16} /> Entered
              </>
            ) : (
              <>
                Enter Now <Icon name="send" size={16} />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            aria-pressed={skipped}
            aria-label="Skip listing"
            className={cn(
              "grid h-11 w-11 place-items-center rounded-full border border-sand text-ink/60 transition",
              skipped && "bg-ink/5 text-ink",
            )}
          >
            <Icon name="skip" size={18} />
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share listing"
            className={cn(
              "grid h-11 w-11 place-items-center rounded-full border border-sand text-ink/60 transition hover:bg-ink/5",
              shareFlash && "border-moss bg-moss/10 text-moss",
            )}
          >
            <Icon name={shareFlash ? "check" : "share"} size={18} />
          </button>
        </div>

        <span aria-live="polite" className="sr-only">
          {shareFlash ? "Link copied to clipboard" : ""}
        </span>

        {/* Footer microcopy */}
        <p className="mt-3 text-center text-[10px] uppercase tracking-[0.15em] text-ink/55">
          No purchase necessary
        </p>
      </div>
    </article>
  );
}
