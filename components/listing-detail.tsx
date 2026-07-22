"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { canOptimizeImage } from "@/lib/image";
import { describeEligibility } from "@/lib/eligibility";
import { ContextTag } from "@/components/context-tag";
import { Icon, type IconName } from "@/components/icon";
import { ListingReportButton } from "@/components/listing-report-button";
import { track } from "@/lib/analytics";
import { SOURCE_LABEL_TEXT, daysUntil, isExpired, listingExpiration } from "@/lib/listing-badges";
import { pickListingContext } from "@/lib/listing-context";
import {
  ENTRY_FREQUENCY_LABEL,
  formatEndDate,
  formatPrizeValue,
  formatRelativeTime,
} from "@/lib/listing-format";
import { useNow } from "@/lib/now";
import { nextEntryAt } from "@/lib/sweep-routine";
import { useSeekerState } from "@/lib/seeker-state";
import { listingShareUrl, shareLink } from "@/lib/share";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

const SOURCE_LABEL_NOTE: Record<Listing["sourceLabel"], string> = {
  found_by_sweepza:
    "Normalized by Sweepza from the linked source and reviewed before publication.",
  host_submitted:
    "Submitted by the host and reviewed by Sweepza before publication.",
  claimed_by_host:
    "Originally found by Sweepza, then claimed by a host whose authority was reviewed.",
};

function countdownLabel(listing: Listing, now: Date): string {
  if (isExpired(listing, now)) return "This sweepstakes has ended";
  const expiry = listingExpiration(listing.endDate, now);
  const days = daysUntil(listing.endDate, now);
  if (expiry.state === "ends_today") return "Ends today";
  if (days <= 3) return "Ends soon";
  if (days <= 21) return `${days} days left to enter`;
  return `Ends ${formatEndDate(listing.endDate)}`;
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/[0.04] text-ink/60">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite">
          {label}
        </div>
        <div className="mt-0.5 text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-2xl text-ink">{children}</h2>
  );
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
  const initialState: SeekerUiState = listing.seekerState?.primaryUiState ?? "none";

  const [localState, setLocalState] = useState<SeekerUiState>(initialState);
  const [localSaved, setLocalSaved] = useState(initialState === "saved");
  const [shareFlash, setShareFlash] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState(false);

  const uiState = store ? store.getState(listing.id) ?? initialState : localState;
  const saved = store ? store.isSaved(listing.id) : localSaved;
  const won = uiState === "won";
  const entered = uiState === "entered";

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
    if (isSignedIn) {
      void fetch("/api/seeker-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, viewed: true }),
      });
    }
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
    if (expired || won) return;
    track("listing_enter_clicked", baseProps);
    if (typeof window !== "undefined") {
      window.open(listing.entryUrl, "_blank", "noopener,noreferrer");
    }
    setConfirmEntry(true);
  }
  function handleMarkEntered() {
    setPrimary("entered");
    setConfirmEntry(false);
    track("listing_marked_entered", { listing_id: listing.id });
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

  const context = useMemo(
    () =>
      pickListingContext(
        listing,
        { uiState, saved, activity: store?.getActivity(listing.id) },
        now,
      ),
    [listing, uiState, saved, store, now],
  );

  const imageUrl = listing.mainImageUrl ?? listing.categoryFallbackImageUrl;
  const sourceText = SOURCE_LABEL_TEXT[listing.sourceLabel];
  const attributionName = listing.host?.name ?? listing.originalSponsorName;
  const hostVerified =
    listing.host?.verificationStatus === "admin_verified";
  const prizeValue = formatPrizeValue(listing.prizeValue, listing.prizeCurrency);
  const countdown = countdownLabel(listing, now);
  const days = daysUntil(listing.endDate, now);
  const urgentEnd = !expired && days <= 3;

  const eligibility = describeEligibility({
    eligibilityCountry: listing.eligibilityCountry,
    eligibilityStates: listing.eligibilityStates,
    ageRequirement: listing.ageRequirement,
    entryLimitNotes: listing.entryLimitNotes,
  });
  const publicEligibilityFacets = [
    eligibility.facets[0],
    eligibility.facets[1],
    eligibility.facets[3],
  ];

  // Ready-again integration for entered recurring sweeps.
  const readyAgainAt = entered
    ? nextEntryAt(store?.getActivity(listing.id)?.enteredAt ?? "", listing.entryFrequency)
    : null;

  const enterLabel = won
    ? "You won this"
    : expired
      ? "Sweepstakes ended"
      : entered
        ? "Entered — enter again"
        : "Enter now";

  // ---- Action block, reused in the sticky rail (desktop) and inline (mobile) ----
  const actionBlock = (
    <div className="flex flex-col gap-3">
      {prizeValue && (
        <div>
          <div className="font-display text-[34px] leading-none text-ink">
            {prizeValue}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-graphite">
            estimated prize value
          </div>
        </div>
      )}
      <div
        className={cn(
          "flex items-center gap-1.5 text-sm font-semibold",
          expired ? "text-graphite" : urgentEnd ? "text-flame" : "text-ink",
        )}
      >
        <Icon name="clock" size={15} />
        <span className="nums">{countdown}</span>
      </div>

      <button
        type="button"
        onClick={handleEnter}
        disabled={expired || won}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-semibold transition",
          won
            ? "cursor-default bg-pine text-on-trust"
            : expired
              ? "cursor-not-allowed bg-line text-graphite"
              : entered
                ? "bg-pine/12 text-pine hover:bg-pine/18"
                : "bg-ember text-on-accent hover:bg-ember/90",
        )}
      >
        {won ? (
          <>
            <Icon name="trophy" size={18} weight="fill" /> {enterLabel}
          </>
        ) : entered && !expired ? (
          <>
            <Icon name="repeat" size={17} /> {enterLabel}
          </>
        ) : expired ? (
          enterLabel
        ) : (
          <>
            {enterLabel} <Icon name="send" size={16} />
          </>
        )}
      </button>

      <p className="text-center text-[11px] text-graphite">
        Opens the entry page provided for this listing · Sweepza never charges to enter
      </p>

      {confirmEntry && !entered ? (
        <div className="rounded-xl border border-pine/25 bg-pine/5 p-3" role="status">
          <p className="text-sm font-medium text-ink">Did you complete the sponsor&apos;s entry?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={handleMarkEntered} className="min-h-11 flex-1 rounded-xl bg-pine px-3 py-2 text-xs font-semibold text-white">
              Yes, mark entered
            </button>
            <button type="button" onClick={() => setConfirmEntry(false)} className="min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-graphite">
              Not yet
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleSaved}
          aria-pressed={saved}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition",
            saved
              ? "border-ember bg-ember/8 text-ember"
              : "border-line text-ink/75 hover:border-ink/25",
          )}
        >
          <Icon name="bookmark" size={16} weight={saved ? "fill" : "regular"} />
          {saved ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share this sweepstakes"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink/75 transition hover:border-ink/25"
        >
          <Icon name={shareFlash ? "check" : "share"} size={16} />
          {shareFlash ? "Copied" : "Share"}
        </button>
      </div>

      {listing.officialRulesUrl && (
        <a
          href={listing.officialRulesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-ink/[0.04] py-2.5 text-sm font-semibold text-ink/80 transition hover:bg-ink/[0.07]"
        >
          <Icon name="rules" size={15} /> Official rules (authoritative)
          <Icon name="externalLink" size={12} />
        </a>
      )}

      {entered && !won && (
        <button
          type="button"
          onClick={handleMarkWon}
          className="min-h-11 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/40 bg-gold/[0.07] py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/[0.12]"
        >
          <Icon name="trophy" size={16} /> I won this sweepstakes
        </button>
      )}
      {won && (
        <Link
          href="/winners/new"
          className="min-h-11 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gold py-2.5 text-sm font-semibold text-on-won transition hover:bg-gold/90"
        >
          <Icon name="trophy" size={16} weight="fill" /> Share it on the Winner Wall
        </Link>
      )}

      {readyAgainAt && (
        <p className="rounded-xl bg-pine/[0.06] px-3 py-2 text-center text-xs font-medium text-pine">
          {readyAgainAt.getTime() <= now.getTime()
            ? "Ready to enter again now"
            : `Ready again ${formatRelativeTime(readyAgainAt.toISOString(), now).replace(" ago", "")}`}
        </p>
      )}
    </div>
  );

  return (
    <section className="px-4 pb-28 pt-5 lg:mx-auto lg:max-w-5xl lg:px-8 lg:pb-12">
      <Link
        href="/discover"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-graphite transition hover:text-ink"
      >
        <Icon name="caretRight" size={15} className="rotate-180" /> Discover
      </Link>

      <div className="lg:grid lg:grid-cols-[1.7fr_1fr] lg:items-start lg:gap-10">
        {/* ---- Editorial record ---- */}
        <div className="min-w-0">
          {/* Hero */}
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-card bg-line">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={listing.imageAltText ?? listing.prizeName}
                fill
                priority
                className="object-cover"
                sizes="(min-width:1024px) 640px, 100vw"
                unoptimized={!canOptimizeImage(imageUrl)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-line to-paper text-ink/25">
                <Icon name="gift" size={64} />
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/45 to-transparent" />
            <div className="absolute left-4 bottom-4">
              <ContextTag context={context} variant="chip" />
            </div>
            <button
              type="button"
              onClick={toggleSaved}
              aria-pressed={saved}
              aria-label={saved ? "Saved" : "Save this sweepstakes"}
              className={cn(
                "absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full shadow-e1 backdrop-blur transition",
                saved ? "bg-ember text-on-accent" : "bg-surface/85 text-ink hover:bg-surface",
              )}
            >
              <Icon name="bookmark" size={18} weight={saved ? "fill" : "regular"} />
            </button>
            <ListingReportButton
              listingId={listing.id}
              clerkConfigured={clerkConfigured}
              isSignedIn={isSignedIn}
            />
          </div>

          {/* Title + attribution */}
          <div className="mt-5">
            <h1 className="font-display text-[34px] font-medium leading-[1.08] tracking-tightest text-ink lg:text-[42px]">
              {listing.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-graphite">
              <span className="font-medium text-ink/80">
                {attributionName ?? sourceText}
              </span>
              {hostVerified && (
                <span className="inline-flex items-center gap-0.5 text-pine">
                  <Icon name="verified" size={13} weight="fill" /> Verified
                </span>
              )}
              <span aria-hidden>·</span>
              <span>{sourceText}</span>
            </p>
          </div>

          {/* Mobile action block sits right under the title. */}
          <div className="mt-5 rounded-card border border-line bg-surface p-5 shadow-e1 lg:hidden">
            {actionBlock}
          </div>

          {/* Long description */}
          <div className="mt-8">
            <SectionHeading>About this prize</SectionHeading>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-graphite">
              Sweepza normalized summary
            </p>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink/80">
              {listing.longDescription ?? listing.shortDescription}
            </p>
          </div>

          {/* Facts: timeline / eligibility / entry / prize */}
          <div className="mt-8 grid gap-x-8 sm:grid-cols-2">
            <div className="divide-y divide-line">
              <Fact icon="calendar" label="Opens">
                {listing.startDate ? formatEndDate(listing.startDate) : "—"}
              </Fact>
              <Fact icon="clock" label={expired ? "Ended" : "Ends"}>
                <span className={cn("nums", urgentEnd && "font-semibold text-flame")}>
                  {formatEndDate(listing.endDate)}
                </span>
              </Fact>
              <Fact icon="repeat" label="Entry">
                {ENTRY_FREQUENCY_LABEL[listing.entryFrequency]}
                {listing.entryLimitNotes ? ` · ${listing.entryLimitNotes}` : ""}
              </Fact>
            </div>
            <div className="divide-y divide-line">
              {publicEligibilityFacets.map((facet) => (
                <Fact
                  key={facet.label}
                  icon={facet.label === "Entry limits" ? "repeat" : facet.label === "Region" ? "location" : "gift"}
                  label={facet.label}
                >
                  <span className={facet.certainty === "unknown" ? "text-graphite" : undefined}>
                    {facet.value}
                  </span>
                </Fact>
              ))}
              {eligibility.hasUnknowns && (
                <p className="py-3 text-xs text-graphite">
                  Some eligibility terms were not stated in the source. Check the official rules before entering.
                </p>
              )}
              <Fact icon="gift" label="Prize">
                {listing.prizeName}
                {listing.winnerCount
                  ? ` · ${listing.winnerCount} winner${listing.winnerCount > 1 ? "s" : ""}`
                  : ""}
              </Fact>
            </div>
          </div>

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <div className="mt-8">
              <SectionHeading>Tags</SectionHeading>
              <div className="flex flex-wrap gap-2">
                {listing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-pill bg-ink/[0.05] px-3 py-1.5 text-xs font-medium text-ink/75"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Host / source & trust */}
          <div className="mt-8">
            <SectionHeading>Source &amp; trust</SectionHeading>
            <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
              <div className="flex items-center gap-3">
                {listing.host?.logoUrl ? (
                  <Image
                    src={listing.host.logoUrl}
                    alt={listing.host.name}
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover"
                    unoptimized={!canOptimizeImage(listing.host.logoUrl)}
                  />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-ink/[0.05] text-base font-bold text-ink/50">
                    {(attributionName ?? "S").charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {attributionName ?? sourceText}
                    {hostVerified && (
                      <Icon name="verified" size={14} weight="fill" className="text-pine" />
                    )}
                  </div>
                  <div className="text-xs text-graphite">
                    {hostVerified ? "Verified host" : sourceText}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink/75">
                {SOURCE_LABEL_NOTE[listing.sourceLabel]}
                {hostVerified ? " Sweepza reviewed this host's authority." : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-graphite">
                {listing.originalSponsorName && (
                  <span>Original sponsor: {listing.originalSponsorName}</span>
                )}
                {listing.publishedAt && (
                  <span>Listed {formatRelativeTime(listing.publishedAt, now)}</span>
                )}
                {expired && <span className="text-flame">Closed for entry</span>}
              </div>
              {listing.sourceLabel === "found_by_sweepza" && !listing.host ? (
                <Link
                  href={`/host/claims?listingId=${encodeURIComponent(listing.id)}`}
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper"
                >
                  Sponsor or administrator? Claim this listing
                </Link>
              ) : null}
            </div>
          </div>

          {/* Winner wall */}
          {listing.winnerReported && (
            <Link
              href="/winners"
              className="mt-6 flex items-center gap-3 rounded-card border border-gold/25 bg-gold/[0.06] p-4 transition hover:bg-gold/[0.1]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
                <Icon name="trophy" size={18} weight="fill" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Winners reported</p>
                <p className="text-xs text-graphite">
                  Members have shared wins from this sweepstakes.
                </p>
              </div>
              <Icon name="caretRight" size={16} className="text-ink/30" />
            </Link>
          )}

          <p className="mt-8 text-center text-[10px] uppercase tracking-[0.18em] text-graphite lg:text-left">
            Review the official rules for purchase requirements, eligibility, odds, and entry terms
          </p>
        </div>

        {/* ---- Sticky action rail (desktop) ---- */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-card border border-line bg-surface p-6 shadow-e2">
            {actionBlock}
          </div>
        </aside>
      </div>

      {/* ---- Mobile sticky enter bar ---- */}
      {!won && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={handleEnter}
            disabled={expired}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition",
              expired
                ? "cursor-not-allowed bg-line text-graphite"
                : entered
                  ? "bg-pine text-on-trust"
                  : "bg-ember text-on-accent",
            )}
          >
            {expired ? (
              "Sweepstakes ended"
            ) : entered ? (
              <>
                <Icon name="repeat" size={17} /> Enter again
              </>
            ) : (
              <>
                Enter now <Icon name="send" size={16} />
              </>
            )}
          </button>
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {shareFlash ? "Link copied to clipboard" : ""}
      </span>
    </section>
  );
}
