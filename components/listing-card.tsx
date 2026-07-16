"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { CardCelebration } from "@/components/card-celebration";
import { ContextTag } from "@/components/context-tag";
import { Icon } from "@/components/icon";
import { ReentryCountdown } from "@/components/reentry-countdown";
import { track } from "@/lib/analytics";
import { canOptimizeImage } from "@/lib/image";
import { SOURCE_LABEL_TEXT, daysUntil, isExpired } from "@/lib/listing-badges";
import { pickListingContext } from "@/lib/listing-context";
import { formatEndDate, formatPrizeValue } from "@/lib/listing-format";
import { useNow } from "@/lib/now";
import { useSeekerState } from "@/lib/seeker-state";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

// Canonical discovery + action card. Designed around one job: understand the
// prize and decide fast. Photo is the hero; exactly one context label; prize
// value and the closing date carry the desire and the urgency; a single
// primary action (Enter Now) with one quiet route to the full record.
export type CardSurface = "scroll" | "swipe" | "detail";

/** Featured cards get a taller cinematic cover; standard cards a 16:11. */
export type CardTone = "standard" | "featured";

function countdownLabel(listing: Listing, now: Date): string {
  if (isExpired(listing, now)) return "Ended";
  const days = daysUntil(listing.endDate, now);
  if (days <= 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  if (days <= 14) return `${days} days left`;
  return formatEndDate(listing.endDate);
}

export function ListingCard({
  listing,
  surface,
  tone = "standard",
  priority = false,
}: {
  listing: Listing;
  surface?: CardSurface;
  tone?: CardTone;
  priority?: boolean;
}) {
  const store = useSeekerState();
  const now = useNow();
  const expired = isExpired(listing, now);
  const initialState: SeekerUiState = listing.seekerState?.primaryUiState ?? "none";

  const [localState, setLocalState] = useState<SeekerUiState>(initialState);
  const [localSaved, setLocalSaved] = useState(initialState === "saved");

  const uiState = store ? store.getState(listing.id) ?? initialState : localState;
  const saved = store ? store.isSaved(listing.id) : localSaved;
  const won = uiState === "won";
  const entered = uiState === "entered";

  // Memory-lifecycle motion. A transient flag plays a celebratory beat only
  // when a state is *newly reached* in this session — never on mount, and never
  // for the store's one-time async hydration (which can flip an already-acted
  // item none -> entered/won without a real user action). `save-pop` is
  // separate (saved is not part of uiState).
  const hydrated = store ? store.hydrated : true;
  const [savePop, setSavePop] = useState(false);
  const [celebrate, setCelebrate] = useState<"entered" | "won" | null>(null);
  const [reopened, setReopened] = useState(false);
  const prevStateRef = useRef<SeekerUiState>(uiState);
  const rebasedRef = useRef(false);
  useEffect(() => {
    // Hold until the store's authoritative values have landed. The first render
    // after that rebases the baseline silently, so only transitions that happen
    // afterward (a real enter/win in this session) celebrate.
    if (!hydrated) return;
    if (!rebasedRef.current) {
      rebasedRef.current = true;
      prevStateRef.current = uiState;
      return;
    }
    const prev = prevStateRef.current;
    if (prev === uiState) return;
    prevStateRef.current = uiState;
    if (uiState === "won") setCelebrate("won");
    else if (uiState === "entered") setCelebrate("entered");
    else setCelebrate(null);
    // The win sheen runs for 2.4s after a 150ms delay. Keep its host mounted
    // through the full sweep; the shorter entered pop can clear sooner.
    const celebrationMs = uiState === "won" ? 2_700 : 900;
    const t = setTimeout(() => setCelebrate(null), celebrationMs);
    return () => clearTimeout(t);
  }, [uiState, hydrated]);

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
    if (willSave) {
      track("listing_saved", baseProps);
      setSavePop(true);
      setTimeout(() => setSavePop(false), 360);
    }
  }

  function handleEnter() {
    if (expired || won) return;
    track("listing_enter_clicked", baseProps);
    if (typeof window !== "undefined") {
      window.open(listing.entryUrl, "_blank", "noopener,noreferrer");
    }
    setPrimary("entered");
    setReopened(false);
    track("listing_marked_entered", { listing_id: listing.id });
  }

  const context = useMemo(
    () =>
      pickListingContext(
        listing,
        {
          uiState,
          saved,
          activity: store?.getActivity(listing.id),
        },
        now,
      ),
    [listing, uiState, saved, store, now],
  );

  const imageUrl = listing.mainImageUrl ?? listing.categoryFallbackImageUrl;
  const sourceText = SOURCE_LABEL_TEXT[listing.sourceLabel];
  const attributionName = listing.host?.name ?? listing.originalSponsorName;
  const hostVerified =
    listing.host?.verificationStatus === "self_verified" ||
    listing.host?.verificationStatus === "admin_verified";

  const prizeValue = formatPrizeValue(listing.prizeValue, listing.prizeCurrency);
  const countdown = countdownLabel(listing, now);
  const days = daysUntil(listing.endDate, now);
  const urgentEnd = !expired && days <= 3;

  // The daily loop: an entered, recurring sweep counts down to its next entry
  // window, then re-opens as "Enter again". `reopened` is the live client flip
  // from the in-card countdown; `context.tone === "again"` is the frozen-clock
  // check that also covers server render and first paint.
  const activity = store?.getActivity(listing.id);
  const enteredAt = activity?.enteredAt ?? listing.seekerState?.enteredAt;
  const recurring =
    listing.entryFrequency === "daily" ||
    listing.entryFrequency === "instant_win" ||
    listing.entryFrequency === "weekly" ||
    listing.entryFrequency === "monthly";
  const readyAgain = context.tone === "again" || reopened;
  const awaitingReentry =
    entered && recurring && !readyAgain && !won && !expired && Boolean(enteredAt);
  const enterState = won
    ? "won"
    : expired
      ? "expired"
      : entered && readyAgain
        ? "again"
        : awaitingReentry
          ? "waiting"
          : entered
            ? "entered"
            : "open";

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-e1 transition duration-200 hover:-translate-y-0.5 hover:shadow-e2",
        expired && "opacity-[0.78]",
      )}
    >
      {/* Cover — the hero. One context chip, one save control. */}
      <div
        className={cn(
          "relative w-full overflow-hidden bg-line",
          tone === "featured" ? "aspect-[16/9]" : "aspect-[16/11]",
        )}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={listing.imageAltText ?? listing.prizeName}
            fill
            priority={priority}
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            sizes={
              tone === "featured"
                ? "(min-width:1024px) 720px, 100vw"
                : "(min-width:1536px) 360px, (min-width:1024px) 460px, 100vw"
            }
            unoptimized={!canOptimizeImage(imageUrl)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-line to-paper text-ink/25">
            <Icon name="gift" size={44} />
          </div>
        )}

        {/* Legibility scrim only where the chip sits. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/45 to-transparent" />

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <ContextTag context={context} variant="chip" />
        </div>

        <button
          type="button"
          onClick={toggleSaved}
          aria-pressed={saved}
          aria-label={saved ? `Saved ${listing.title}` : `Save ${listing.title}`}
          className={cn(
            "absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full shadow-e1 backdrop-blur transition active:scale-90",
            savePop && "animate-save-pop",
            saved
              ? "bg-ember text-on-accent"
              : "bg-surface/85 text-ink hover:bg-surface",
          )}
        >
          <Icon name="bookmark" size={17} weight={saved ? "fill" : "regular"} />
        </button>

        {celebrate && <CardCelebration kind={celebrate} />}
      </div>

      {/* Record — title, prize, timing, trust, action. */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[17px] font-semibold leading-snug tracking-tightest text-ink">
            <Link
              href={`/sweeps/${listing.slug}`}
              className="line-clamp-2 outline-none transition hover:text-ink/70 focus-visible:underline"
            >
              {listing.title}
            </Link>
          </h3>
          {prizeValue && (
            <div className="shrink-0 text-right">
              <div className="font-display text-[22px] leading-none text-gold">
                {prizeValue}
              </div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-graphite">
                {listing.winnerCount && listing.winnerCount > 1
                  ? `${listing.winnerCount} winners`
                  : "value"}
              </div>
            </div>
          )}
        </div>

        <p className="mt-1.5 line-clamp-1 text-sm text-graphite">
          {listing.shortDescription}
        </p>

        <p className="mt-1 truncate text-xs font-medium text-graphite/80">
          {attributionName ? `${attributionName} · ${sourceText}` : sourceText}
          {hostVerified && (
            <span className="ml-1 inline-flex translate-y-0.5 text-pine">
              <Icon name="verified" size={12} weight="fill" />
            </span>
          )}
        </p>

        {/* Begins / Ends — Ends carries urgency. */}
        <div className="mt-3.5 flex items-end justify-between border-t border-line pt-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-graphite">
              Begins
            </div>
            <div className="nums mt-0.5 text-[13px] font-medium text-ink/75">
              {listing.startDate ? formatEndDate(listing.startDate) : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-graphite">
              Ends
            </div>
            <div
              className={cn(
                "nums mt-0.5 text-[13px] font-semibold",
                expired ? "text-graphite" : urgentEnd ? "text-flame" : "text-ink",
              )}
            >
              {countdown}
            </div>
          </div>
        </div>

        {listing.officialRulesUrl && (
          <a
            href={listing.officialRulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex w-fit items-center gap-1 text-xs font-medium text-graphite underline-offset-2 transition hover:text-ink hover:underline"
          >
            Official rules
            <Icon name="caretRight" size={11} className="-rotate-45" />
          </a>
        )}

        {/* Action — one primary, one quiet route to the full record. */}
        <div className="mt-3.5 flex items-stretch gap-2">
          {enterState === "waiting" ? (
            <div className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-pine/25 bg-pine/8 px-4 text-[13px] font-medium text-pine">
              <Icon name="clock" size={15} />
              <span className="min-w-0 truncate">
                {enteredAt ? (
                  <ReentryCountdown
                    enteredAt={enteredAt}
                    frequency={listing.entryFrequency}
                    onReady={() => setReopened(true)}
                  />
                ) : (
                  "Entered"
                )}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleEnter}
              disabled={expired || won}
            className={cn(
              "relative flex min-h-11 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-4 text-sm font-semibold transition",
              enterState === "won"
                ? "cursor-default bg-pine text-on-trust"
                : enterState === "expired"
                  ? "cursor-not-allowed bg-line text-graphite"
                  : enterState === "entered"
                    ? "bg-pine/12 text-pine hover:bg-pine/18"
                    : "bg-ember text-on-accent hover:bg-ember/90",
              // The recurrence invitation: a calm breathing ring while a
              // re-entry window is open again.
              enterState === "again" && "animate-ready-glow",
            )}
          >
            {/* One-time sheen sweep the moment a win lands. */}
            {celebrate === "won" && (
              <span
                aria-hidden
                className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            )}
            {enterState === "won" ? (
              <>
                <span className={cn(celebrate === "won" && "animate-pop-in")}>
                  <Icon name="trophy" size={16} weight="fill" />
                </span>{" "}
                Won
              </>
            ) : enterState === "expired" ? (
              "Ended"
            ) : enterState === "again" ? (
              <>
                Enter again <Icon name="repeat" size={15} />
              </>
            ) : enterState === "entered" ? (
              <>
                <span className={cn(celebrate === "entered" && "animate-pop-in")}>
                  <Icon name="check" size={16} />
                </span>{" "}
                Entered
              </>
            ) : (
              <>
                Enter now <Icon name="send" size={15} />
              </>
            )}
            </button>
          )}

          <Link
            href={`/sweeps/${listing.slug}`}
            aria-label={`More info about ${listing.title}`}
            className="grid w-11 place-items-center rounded-xl border border-line text-ink/70 transition hover:border-ink/25 hover:text-ink"
          >
            <Icon name="info" size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
}
