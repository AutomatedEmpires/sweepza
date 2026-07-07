"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icon";
import { ListingBadge } from "@/components/listing-badge";
import { ListingReportButton } from "@/components/listing-report-button";
import { track } from "@/lib/analytics";
import {
  SOURCE_LABEL_TEXT,
  computeBadges,
  daysUntil,
  isExpired,
} from "@/lib/listing-badges";
import {
  ENTRY_FREQUENCY_LABEL,
  formatEndDate,
  formatPrizeValue,
  formatRelativeTime,
} from "@/lib/listing-format";
import { useNow } from "@/lib/now";
import { useSeekerState } from "@/lib/seeker-state";
import { listingShareUrl, shareLink } from "@/lib/share";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

const SOURCE_LABEL_NOTE: Record<Listing["sourceLabel"], string> = {
  found_by_sweepza: "Curated and listed by the Sweepza team.",
  host_submitted: "Submitted directly by the host.",
  claimed_by_host:
    "Originally found by Sweepza and later claimed by the host.",
};

interface RuleRow {
  id: string;
  icon: IconName;
  label: string;
  value: string;
}

function countdownLabel(listing: Listing, now: Date): string {
  if (isExpired(listing, now)) return "Ended";
  const days = daysUntil(listing.endDate, now);
  if (days <= 0) return "Ends today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function ListingDetail({
  listing,
  clerkConfigured,
  isSignedIn,
}: {
  listing: Listing;
  clerkConfigured: boolean;
  isSignedIn: boolean;
}) {
  const store = useSeekerState();
  const now = useNow();
  const expired = isExpired(listing, now);
  const initialState: SeekerUiState =
    listing.seekerState?.primaryUiState ?? "none";

  const [localState, setLocalState] = useState<SeekerUiState>(initialState);
  const [localSaved, setLocalSaved] = useState(initialState === "saved");
  const [hostOpen, setHostOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareFlash, setShareFlash] = useState(false);

  const uiState = store ? store.getState(listing.id) ?? initialState : localState;
  const saved = store ? store.isSaved(listing.id) : localSaved;

  const baseProps = useMemo(
    () => ({
      listing_id: listing.id,
      source_label: listing.sourceLabel,
      surface: "detail" as const,
    }),
    [listing.id, listing.sourceLabel],
  );

  useEffect(() => {
    track("listing_viewed", { ...baseProps, category: listing.prizeCategory });
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

  function handleMarkWon() {
    setPrimary("won");
    track("listing_marked_won", baseProps);
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

  const badges = useMemo(() => computeBadges(listing, now), [listing, now]);
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

  const prizeMeta = [
    listing.prizeCategory,
    listing.winnerCount
      ? `${listing.winnerCount} winner${listing.winnerCount > 1 ? "s" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rules: RuleRow[] = [];
  rules.push({
    id: "ends",
    icon: "calendar",
    label: expired ? "Ended" : "End date",
    value: formatEndDate(listing.endDate),
  });
  if (listing.startDate) {
    rules.push({
      id: "opens",
      icon: "calendar",
      label: "Opens",
      value: formatEndDate(listing.startDate),
    });
  }
  rules.push({
    id: "entry",
    icon: "repeat",
    label: "Entry",
    value: ENTRY_FREQUENCY_LABEL[listing.entryFrequency],
  });
  if (listing.entryLimitNotes) {
    rules.push({
      id: "entry-limit",
      icon: "repeat",
      label: "Entry limit",
      value: listing.entryLimitNotes,
    });
  }
  const eligibility = [
    listing.eligibilityCountry,
    listing.ageRequirement ? `${listing.ageRequirement}+` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (eligibility) {
    rules.push({
      id: "eligibility",
      icon: "location",
      label: "Eligibility",
      value: eligibility,
    });
  }
  if (listing.eligibilityStates && listing.eligibilityStates.length > 0) {
    rules.push({
      id: "states",
      icon: "location",
      label: "States",
      value: listing.eligibilityStates.join(", "),
    });
  }

  return (
    <section className="px-4 pb-12 pt-6">
      <Link
        href="/discover"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink/60 transition hover:text-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Discover
      </Link>

      {/* Hero card */}
      <div className="overflow-hidden rounded-card border border-sand bg-cream shadow-sm">
        {/* Photo + overlays */}
        <div className="relative aspect-[4/3] w-full bg-sand">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={listing.imageAltText ?? listing.prizeName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink/30">
              <Icon name="gift" size={64} />
            </div>
          )}

          {/* Host seal */}
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-cream/90 py-1 pl-1 pr-2.5 shadow-sm backdrop-blur">
            {listing.host?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.host.logoUrl}
                alt={listing.host.name}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-sand text-[11px] font-bold text-ink/60">
                {hostName.charAt(0)}
              </span>
            )}
            <span className="max-w-[7rem] truncate text-xs font-semibold text-ink">
              {hostName}
            </span>
            {hostVerified && (
              <Icon name="verified" size={14} className="text-moss" />
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
              "absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full shadow-sm backdrop-blur transition",
              saved ? "bg-ember text-cream" : "bg-cream/90 text-ink",
            )}
          >
            <Icon name="bookmark" size={20} />
          </button>

          <ListingReportButton
            listingId={listing.id}
            clerkConfigured={clerkConfigured}
            isSignedIn={isSignedIn}
          />

          {/* Urgency / trust badges */}
          {badges.length > 0 && (
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 pr-3">
              {badges.slice(0, 4).map((badge) => (
                <ListingBadge key={badge.id} badge={badge} />
              ))}
            </div>
          )}
        </div>

        {/* Cream content panel */}
        <div className="relative -mt-5 rounded-t-[2rem] bg-cream px-5 pb-5 pt-5">
          <h1 className="font-display text-3xl leading-tight text-ink">
            <span className="box-decoration-clone bg-gradient-to-b from-transparent to-moss/25 px-0.5">
              {listing.title}
            </span>
          </h1>

          <p className="mt-1 text-xs font-medium text-ink/45">
            {attributionName ? `${attributionName} · ${sourceText}` : sourceText}
          </p>

          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            {listing.shortDescription}
          </p>

          {/* Dashed divider with doodle */}
          <div className="relative my-4 flex items-center justify-center">
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-sand" />
            <span className="relative bg-cream px-2 text-moss">
              <Icon name="gift" size={16} />
            </span>
          </div>

          {/* Begins / Ends */}
          <div className="flex items-stretch text-center">
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                Begins
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-ink/75">
                <Icon name="calendar" size={14} className="text-ink/40" />
                {startLabel}
              </p>
            </div>
            <div className="mx-3 w-px bg-sand" />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                Ends
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-ink/75">
                <Icon name="calendar" size={14} className="text-ink/40" />
                {endLabel}
              </p>
              <p
                className={cn(
                  "text-[11px] font-semibold",
                  expired ? "text-ink/40" : "text-ember",
                )}
              >
                {countdown}
              </p>
            </div>
          </div>

          {/* Official rules pill */}
          {listing.officialRulesUrl && (
            <a
              href={listing.officialRulesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-ink/5"
            >
              <Icon name="rules" size={14} /> Official Rules
            </a>
          )}

          {/* Enter + info */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnter}
              disabled={expired}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-3 text-base font-semibold transition",
                expired
                  ? "cursor-not-allowed bg-ink/10 text-ink/40"
                  : won
                    ? "bg-moss text-cream"
                    : entered
                      ? "bg-moss/15 text-moss"
                      : "bg-moss text-cream hover:bg-moss/90",
              )}
            >
              {expired ? (
                "Sweepstakes ended"
              ) : won ? (
                <>
                  <Icon name="trophy" size={18} /> Won
                </>
              ) : entered ? (
                <>
                  <Icon name="check" size={18} /> Entered — enter again
                </>
              ) : (
                <>
                  Enter Now <Icon name="send" size={18} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setInfoOpen((o) => !o)}
              aria-expanded={infoOpen}
              aria-label="About entering"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-sand text-ink/60 transition hover:bg-ink/5"
            >
              <Icon name="info" size={20} />
            </button>
          </div>

          {infoOpen && (
            <p className="mt-2 rounded-card border border-sand bg-cream/70 p-3 text-xs leading-relaxed text-ink/65">
              Entering opens the host&apos;s official entry page in a new tab and
              marks this sweepstakes as entered for you. Always read the official
              rules — Sweepza never charges to enter.
            </p>
          )}

          {/* Win reporting — user-reported state that feeds the Won view and
              the Winner Wall. Entered sweeps stay winnable after they end
              (winners are usually announced later). */}
          {entered && !won && (
            <button
              type="button"
              onClick={handleMarkWon}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-moss/40 bg-moss/5 px-4 py-2.5 text-sm font-semibold text-moss transition hover:bg-moss/10"
            >
              <Icon name="trophy" size={16} /> I won this sweepstakes
            </button>
          )}
          {won && (
            <Link
              href="/winners/new"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-ember px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-ember/90"
            >
              <Icon name="trophy" size={16} /> You won — share it on the Winner
              Wall
            </Link>
          )}

          {/* Secondary actions */}
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              aria-pressed={skipped}
              aria-label="Skip listing"
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium text-ink/55 transition hover:text-ink",
                skipped && "text-ink",
              )}
            >
              <Icon name="skip" size={15} /> {skipped ? "Skipped" : "Skip"}
            </button>
            <span className="text-ink/20">·</span>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share listing"
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium text-ink/55 transition hover:text-ink",
                shareFlash && "text-moss",
              )}
            >
              <Icon name={shareFlash ? "check" : "share"} size={15} />{" "}
              {shareFlash ? "Link copied" : "Share"}
            </button>
            <span aria-live="polite" className="sr-only">
              {shareFlash ? "Link copied to clipboard" : ""}
            </span>
          </div>

          {/* Footer microcopy */}
          <p className="mt-4 text-center text-[10px] uppercase tracking-[0.15em] text-ink/40">
            No purchase necessary
          </p>
        </div>
      </div>

      {/* Prize summary */}
      <div className="mt-4 rounded-card border border-sand bg-cream/60 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-moss/10 text-moss">
            <Icon name="gift" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/45">
              Prize
            </p>
            <p className="text-base font-semibold text-ink">
              {listing.prizeName}
            </p>
            {prizeValue && (
              <p className="text-sm font-semibold text-ink">{prizeValue} value</p>
            )}
            {prizeMeta && (
              <p className="mt-0.5 text-xs text-ink/55">{prizeMeta}</p>
            )}
          </div>
        </div>
      </div>

      {/* Rules snapshot */}
      <div className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
          Rules snapshot
        </h2>
        <dl className="divide-y divide-sand overflow-hidden rounded-card border border-sand">
          {rules.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <Icon name={row.icon} size={16} className="shrink-0 text-ink/40" />
              <dt className="text-ink/60">{row.label}</dt>
              <dd className="ml-auto text-right font-medium text-ink">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Host popup access */}
      {listing.host ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setHostOpen((o) => !o)}
            aria-expanded={hostOpen}
            className="flex w-full items-center gap-3 rounded-card border border-sand px-4 py-3 text-left transition hover:bg-ink/5"
          >
            {listing.host.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.host.logoUrl}
                alt={listing.host.name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-sand text-sm font-bold text-ink/60">
                {listing.host.name.charAt(0)}
              </span>
            )}
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                {listing.host.name}
                {hostVerified && (
                  <Icon name="verified" size={14} className="text-moss" />
                )}
              </span>
              <span className="block text-xs text-ink/55">
                {hostVerified ? "Verified host" : "Host"} · {sourceText}
              </span>
            </span>
            <span className="ml-auto text-xs font-medium text-sky">
              {hostOpen ? "Hide" : "About"}
            </span>
          </button>
          {hostOpen && (
            <div className="mt-2 rounded-card border border-sand bg-cream/50 p-4 text-sm leading-relaxed text-ink/70">
              <p>
                {hostVerified
                  ? "This host has completed Sweepza verification."
                  : "This host has not completed verification yet."}
              </p>
              <p className="mt-2">{SOURCE_LABEL_NOTE[listing.sourceLabel]}</p>
              {listing.originalSponsorName && (
                <p className="mt-2">
                  Original sponsor: {listing.originalSponsorName}
                </p>
              )}
              {listing.publishedAt && (
                <p className="mt-2 text-xs text-ink/50">
                  Listed on Sweepza {formatRelativeTime(listing.publishedAt, now)}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-card border border-sand bg-cream/50 p-4 text-sm leading-relaxed text-ink/70">
          <p className="font-semibold text-ink">{sourceText}</p>
          <p className="mt-1">{SOURCE_LABEL_NOTE[listing.sourceLabel]}</p>
          {listing.originalSponsorName && (
            <p className="mt-1">Original sponsor: {listing.originalSponsorName}</p>
          )}
          {listing.publishedAt && (
            <p className="mt-2 text-xs text-ink/50">
              Listed on Sweepza {formatRelativeTime(listing.publishedAt)}
            </p>
          )}
        </div>
      )}

      {/* Related Winner Wall */}
      {listing.winnerReported && (
        <div className="mt-6 rounded-card border border-moss/30 bg-moss/5 p-4">
          <div className="flex items-center gap-2 text-moss">
            <Icon name="trophy" size={18} />
            <span className="text-sm font-semibold">Winners reported</span>
          </div>
          <p className="mt-1 text-sm text-ink/70">
            Seekers have shared wins from this sweepstakes.
          </p>
          <Link
            href="/winners"
            className="mt-2 inline-block text-sm font-medium text-sky transition hover:underline"
          >
            See the Winner Wall
          </Link>
        </div>
      )}
    </section>
  );
}
