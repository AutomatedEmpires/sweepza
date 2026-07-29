"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { CardCelebration } from "@/components/card-celebration";
import { ContextTag } from "@/components/context-tag";
import { Icon } from "@/components/icon";
import { ListingMedia } from "@/components/listing-media";
import { ReentryCountdown } from "@/components/reentry-countdown";
import { track } from "@/lib/analytics";
import { SOURCE_LABEL_TEXT, daysUntil, isExpired, listingExpiration } from "@/lib/listing-badges";
import { describeEligibility } from "@/lib/eligibility";
import { pickListingContext } from "@/lib/listing-context";
import {
  ENTRY_FREQUENCY_LABEL,
  formatEndDate,
  formatPrizeValue,
} from "@/lib/listing-format";
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

/** Compact keeps the canonical card lifecycle in a denser queue presentation. */
export type CardVariant = "standard" | "compact";

function countdownLabel(listing: Listing, now: Date): string {
  if (isExpired(listing, now)) return "Ended";
  const expiry = listingExpiration(listing.endDate, now);
  const days = daysUntil(listing.endDate, now);
  if (expiry.state === "ends_today") return "Ends today";
  if (days <= 3) return "Ends soon";
  if (days <= 14) return `${days} days left`;
  return formatEndDate(listing.endDate);
}

export function ListingCard({
  listing,
  surface,
  tone = "standard",
  variant = "standard",
  priority = false,
}: {
  listing: Listing;
  surface?: CardSurface;
  tone?: CardTone;
  variant?: CardVariant;
  priority?: boolean;
}) {
  const store = useSeekerState();
  const now = useNow();
  const expired = isExpired(listing, now);
  const initialState: SeekerUiState = listing.seekerState?.primaryUiState ?? "none";

  const [localState, setLocalState] = useState<SeekerUiState>(initialState);
  const [localSaved, setLocalSaved] = useState(initialState === "saved");
  const [confirmEntry, setConfirmEntry] = useState(false);

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
    setConfirmEntry(true);
  }

  function markEntered() {
    setPrimary("entered");
    setReopened(false);
    setConfirmEntry(false);
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

  const sourceText = SOURCE_LABEL_TEXT[listing.sourceLabel];
  const attributionName = listing.host?.name ?? listing.originalSponsorName;
  const hostVerified =
    listing.host?.verificationStatus === "admin_verified";

  const prizeValue = formatPrizeValue(listing.prizeValue, listing.prizeCurrency);
  const countdown = countdownLabel(listing, now);
  const formattedEndDate = formatEndDate(listing.endDate);
  const deadline =
    expired
      ? `Ended ${formattedEndDate}`
      : countdown === formattedEndDate
        ? `Ends ${formattedEndDate}`
        : `${countdown} · ${formattedEndDate}`;
  const days = daysUntil(listing.endDate, now);
  const urgentEnd = !expired && days <= 3;
  const presentEligibility = useMemo(
    () =>
      describeEligibility(listing).facets.filter(
        (facet) =>
          facet.certainty === "known" ||
          (facet.label === "Region" &&
            Boolean(
              listing.eligibilityCountry?.trim() ||
                listing.eligibilityStates?.some((state) => state.trim()),
            )),
      ),
    [listing],
  );

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

  if (variant === "compact") {
    return (
      <article
        className={cn(
          "group overflow-hidden rounded-card border border-line bg-surface shadow-e1 transition duration-200 hover:border-ink/20 hover:shadow-e2",
          expired && "opacity-[0.78]",
        )}
      >
        <div className="flex min-w-0 gap-3 p-3 sm:gap-4 sm:p-4">
          <Link
            href={`/sweeps/${listing.slug}`}
            aria-label={`View details for ${listing.title}`}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-line outline-none ring-ember/40 transition focus-visible:ring-2 sm:h-28 sm:w-28"
          >
            <ListingMedia
              sourceUrl={listing.mainImageUrl || listing.categoryFallbackImageUrl}
              altText={listing.imageAltText}
              prizeName={listing.prizeName}
              sponsorName={attributionName}
              category={listing.prizeCategory}
              attribution={listing.imageAttribution}
              priority={priority}
              imageClassName="transition duration-500 group-hover:scale-[1.03]"
              sizes="(min-width: 640px) 112px, 96px"
            />
            {celebrate && <CardCelebration kind={celebrate} />}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold leading-snug tracking-tightest text-ink sm:text-base">
                  <Link
                    href={`/sweeps/${listing.slug}`}
                    className="line-clamp-2 outline-none transition hover:text-ink/70 focus-visible:underline"
                  >
                    {listing.title}
                  </Link>
                </h3>
                <p className="mt-1 line-clamp-1 text-sm text-graphite">
                  {listing.prizeName}
                </p>
              </div>
              {prizeValue && (
                <p className="nums shrink-0 font-display text-lg leading-none text-ink sm:text-xl">
                  {prizeValue}
                </p>
              )}
            </div>

            <p className="mt-2 truncate text-xs text-graphite">
              <span className="font-semibold text-ink/75">Sponsor:</span>{" "}
              {attributionName || "Not stated"}
              <span aria-hidden> · </span>
              <span>{sourceText}</span>
              {hostVerified && (
                <span
                  className="ml-1 inline-flex translate-y-0.5 text-pine"
                  aria-label="Verified sponsor"
                  title="Verified sponsor"
                >
                  <Icon name="verified" size={12} weight="fill" />
                </span>
              )}
            </p>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-4 text-graphite">
              <span
                className={cn(
                  "nums inline-flex items-center gap-1 font-semibold",
                  expired ? "text-graphite" : urgentEnd ? "text-flame" : "text-ink/75",
                )}
              >
                <Icon name="clock" size={12} />
                {deadline}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="repeat" size={12} />
                {ENTRY_FREQUENCY_LABEL[listing.entryFrequency]}
              </span>
              {presentEligibility.map((facet) => (
                <span
                  key={facet.label}
                  className="inline-flex min-w-0 max-w-full gap-1"
                  title={`${facet.label}: ${facet.value}`}
                >
                  <span className="shrink-0 font-semibold text-ink/65">
                    {facet.label}:
                  </span>
                  <span className="truncate">{facet.value}</span>
                </span>
              ))}
            </div>

            {listing.officialRulesUrl && (
              <a
                href={listing.officialRulesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-11 items-center gap-1 pr-2 text-[11px] font-semibold text-graphite underline-offset-2 transition hover:text-ink hover:underline"
              >
                Official rules
                <Icon name="externalLink" size={10} />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-stretch gap-2 border-t border-line p-3 sm:px-4">
          {enterState === "waiting" ? (
            <div className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-pine/25 bg-pine/[0.08] px-3 text-[13px] font-medium text-pine">
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
              disabled={expired || won || enterState === "entered"}
              className={cn(
                "relative flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-3 text-[13px] font-semibold transition",
                enterState === "won"
                  ? "cursor-default bg-pine text-on-trust"
                  : enterState === "expired"
                    ? "cursor-not-allowed bg-line text-graphite"
                    : enterState === "entered"
                      ? "cursor-default bg-pine/[0.12] text-pine"
                      : "bg-ember text-on-accent hover:bg-ember/90",
                enterState === "again" && "animate-ready-glow",
              )}
            >
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
                  </span>
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
                  </span>
                  Entered
                </>
              ) : (
                <>
                  Open official entry <Icon name="externalLink" size={14} />
                </>
              )}
            </button>
          )}

          <Link
            href={`/sweeps/${listing.slug}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-line px-3 text-xs font-semibold text-ink/75 transition hover:border-ink/25 hover:text-ink"
          >
            <Icon name="info" size={15} />
            <span className="hidden sm:inline">Details</span>
            <span className="sr-only sm:hidden">Details about {listing.title}</span>
          </Link>

          <button
            type="button"
            onClick={toggleSaved}
            aria-pressed={saved}
            aria-label={saved ? `Saved ${listing.title}` : `Save ${listing.title}`}
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition active:scale-90",
              savePop && "animate-save-pop",
              saved
                ? "border-ember bg-ember text-on-accent"
                : "border-line text-ink/70 hover:border-ink/25 hover:text-ink",
            )}
          >
            <Icon name="bookmark" size={16} weight={saved ? "fill" : "regular"} />
          </button>
        </div>

        {confirmEntry && (!entered || readyAgain) ? (
          <div
            className="border-t border-pine/25 bg-pine/5 p-3 sm:px-4"
            role="status"
          >
            <p className="text-sm font-medium text-ink">
              Did you complete the sponsor&apos;s entry?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={markEntered}
                className="min-h-11 rounded-xl bg-pine px-3 py-2 text-xs font-semibold text-on-trust"
              >
                Yes, mark entered
              </button>
              <button
                type="button"
                onClick={() => setConfirmEntry(false)}
                className="min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-graphite"
              >
                Not yet
              </button>
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-card border border-gold/25 bg-surface shadow-e2 transition duration-200 hover:-translate-y-0.5 hover:border-gold/45 hover:shadow-e3",
        expired && "opacity-[0.78]",
      )}
    >
      {/* Cover — the hero. One context chip, one save control. */}
      <div
        className={cn(
          "relative w-full overflow-hidden bg-line",
          tone === "featured" ? "aspect-[16/9]" : "aspect-[4/3]",
        )}
      >
        <ListingMedia
          sourceUrl={listing.mainImageUrl || listing.categoryFallbackImageUrl}
          altText={listing.imageAltText}
          prizeName={listing.prizeName}
          sponsorName={attributionName}
          category={listing.prizeCategory}
          attribution={listing.imageAttribution}
          priority={priority}
          imageClassName="transition duration-500 group-hover:scale-[1.03]"
          representativeLabelPosition={prizeValue ? "below-prize" : "top"}
          sizes={
            tone === "featured"
              ? "(min-width:1024px) 720px, 100vw"
              : "(min-width:1536px) 360px, (min-width:1024px) 460px, 100vw"
          }
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        <div className="absolute left-3 top-3 flex max-w-[calc(100%-4.75rem)] flex-wrap gap-2">
          {prizeValue ? (
            <span className="nums rounded-pill border border-gold bg-gold px-3 py-1.5 font-display text-lg leading-none text-on-won shadow-e2">
              {prizeValue}
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <ContextTag context={context} variant="chip" />
          <span
            className={cn(
              "nums shrink-0 rounded-pill border px-2.5 py-1.5 text-[11px] font-extrabold shadow-e1 backdrop-blur",
              expired
                ? "border-white/25 bg-black/65 text-white/75"
                : urgentEnd
                  ? "border-flame/70 bg-flame text-on-urgent"
                  : "border-white/30 bg-black/65 text-white",
            )}
          >
            {countdown}
          </span>
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
          {listing.winnerCount && listing.winnerCount > 1 ? (
            <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-graphite">
              {listing.winnerCount} winners
            </p>
          ) : null}
        </div>

        <p className="mt-1.5 line-clamp-1 text-sm text-graphite">
          {listing.shortDescription}
        </p>

        <p className="mt-2 truncate text-xs text-graphite">
          <span className="font-bold text-ink/75">Sponsor:</span>{" "}
          {attributionName || "Not stated"}
          {hostVerified && (
            <span
              className="ml-1 inline-flex translate-y-0.5 text-pine"
              aria-label="Verified sponsor"
              title="Verified sponsor"
            >
              <Icon name="verified" size={12} weight="fill" />
            </span>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="inline-flex min-h-7 items-center gap-1 rounded-pill border border-line bg-surface-2 px-2.5 text-[10px] font-bold text-ink/75">
            <Icon name="repeat" size={12} />
            {ENTRY_FREQUENCY_LABEL[listing.entryFrequency]}
          </span>
          {presentEligibility.slice(0, 2).map((facet) => (
            <span
              key={facet.label}
              title={`${facet.label}: ${facet.value}`}
              className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-pill border border-line bg-surface-2 px-2.5 text-[10px] font-bold text-ink/75"
            >
              {facet.label === "Region" ? <Icon name="location" size={12} /> : null}
              <span className="max-w-[10rem] truncate">{facet.value}</span>
            </span>
          ))}
          <span className="inline-flex min-h-7 items-center gap-1 rounded-pill border border-pine/25 bg-pine/[0.08] px-2.5 text-[10px] font-bold text-pine">
            <Icon name="shield" size={12} />
            {sourceText}
          </span>
        </div>

        {/* Begins / Ends — Ends carries urgency and the exact date remains visible. */}
        <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
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
            className="mt-1 inline-flex min-h-11 w-fit items-center gap-1 pr-3 text-xs font-medium text-graphite underline-offset-2 transition hover:text-ink hover:underline"
          >
            Official rules
            <Icon name="externalLink" size={11} />
          </a>
        )}

        {/* Action — one primary, one quiet route to the full record. */}
        <div className="mt-3.5 flex items-stretch gap-2">
          {enterState === "waiting" ? (
            <div className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-pine/25 bg-pine/[0.08] px-4 text-[13px] font-medium text-pine">
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
              disabled={expired || won || enterState === "entered"}
            className={cn(
              "relative flex min-h-11 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-4 text-sm font-semibold transition",
              enterState === "won"
                ? "cursor-default bg-pine text-on-trust"
                : enterState === "expired"
                  ? "cursor-not-allowed bg-line text-graphite"
                  : enterState === "entered"
                    ? "cursor-default bg-pine/[0.12] text-pine"
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
                Open official entry <Icon name="externalLink" size={15} />
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
        {confirmEntry && (!entered || readyAgain) ? (
          <div className="mt-3 rounded-xl border border-pine/25 bg-pine/5 p-3" role="status">
            <p className="text-sm font-medium text-ink">Did you complete the sponsor&apos;s entry?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={markEntered} className="min-h-11 rounded-xl bg-pine px-3 py-2 text-xs font-semibold text-on-trust">
                Yes, mark entered
              </button>
              <button type="button" onClick={() => setConfirmEntry(false)} className="min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-graphite">
                Not yet
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
