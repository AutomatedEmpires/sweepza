"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { daysUntil } from "@/lib/listing-badges";
import { formatRelativeTime } from "@/lib/listing-format";
import { useSeekerState } from "@/lib/seeker-state";
import {
  EMPTY_ROUTINE_SNAPSHOT,
  buildRecentActivity,
  buildRoutineBuckets,
} from "@/lib/sweep-routine";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

// Today — the personal operating layer. Computes the seeker's routine live
// from the seeker-state snapshot so it stays current as they act, and works
// identically for signed-in (server snapshot) and signed-out (local) seekers.

const LAST_VISIT_KEY = "sweepza-last-visit-at";
const MAX_SECTION_CARDS = 6;

const ACTIVITY_META: Record<
  Exclude<SeekerUiState, "none">,
  { icon: IconName; verb: string }
> = {
  saved: { icon: "bookmark", verb: "Saved" },
  entered: { icon: "send", verb: "Entered" },
  skipped: { icon: "skip", verb: "Skipped" },
  won: { icon: "trophy", verb: "Won" },
};

function Rail({ listings }: { listings: Listing[] }) {
  if (listings.length === 1) {
    return (
      <div className="px-1 lg:max-w-[340px]">
        <ListingCard listing={listings[0]} />
      </div>
    );
  }
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
      {listings.map((listing) => (
        <div
          key={listing.id}
          className="w-[85%] shrink-0 snap-center lg:w-[340px]"
        >
          <ListingCard listing={listing} />
        </div>
      ))}
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  count,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-moss/10 text-moss">
          <Icon name={icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-none text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink/55">{subtitle}</p>
        </div>
        <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold text-ink/60">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

export function TodayDashboard({ listings }: { listings: Listing[] }) {
  const store = useSeekerState();
  const [mounted, setMounted] = useState(false);
  const [lastVisitAt, setLastVisitAt] = useState<string | null>(null);

  useEffect(() => {
    // startTransition: swapping in the personal routine while sibling
    // Suspense boundaries are still hydrating must not force them to
    // client-render (recoverable #418 noise) — let hydration finish first.
    try {
      const previous = window.localStorage.getItem(LAST_VISIT_KEY);
      startTransition(() => {
        setMounted(true);
        setLastVisitAt(previous);
      });
      window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    } catch {
      // Storage unavailable — still mount, just skip "new since last visit".
      startTransition(() => setMounted(true));
    }
  }, []);

  const snapshot = store?.snapshot ?? EMPTY_ROUTINE_SNAPSHOT;

  const buckets = useMemo(
    () => buildRoutineBuckets(listings, snapshot),
    [listings, snapshot],
  );
  const recent = useMemo(
    () => buildRecentActivity(listings, snapshot),
    [listings, snapshot],
  );

  const touchedIds = useMemo(
    () =>
      new Set([
        ...Object.keys(snapshot.primary).filter(
          (id) => snapshot.primary[id] !== "none",
        ),
        ...Object.keys(snapshot.saved),
      ]),
    [snapshot],
  );

  const newSinceLastVisit = useMemo(() => {
    if (!lastVisitAt) return [];
    const since = new Date(lastVisitAt).getTime();
    if (Number.isNaN(since)) return [];
    return listings
      .filter(
        (listing) =>
          listing.publishedAt &&
          new Date(listing.publishedAt).getTime() > since &&
          !touchedIds.has(listing.id),
      )
      .slice(0, MAX_SECTION_CARDS);
  }, [listings, lastVisitAt, touchedIds]);

  // Ready Again is the habit anchor; Ending Today is the urgency anchor.
  const endingToday = buckets.endingSoon.filter(
    (listing) => daysUntil(listing.endDate) <= 0,
  );
  const endingSoonRest = buckets.endingSoon.filter(
    (listing) => daysUntil(listing.endDate) > 0,
  );

  const readyCount = buckets.ready.length + buckets.readyAgain.length;
  const hasRoutine =
    readyCount > 0 ||
    buckets.endingSoon.length > 0 ||
    recent.length > 0 ||
    buckets.entered.length > 0;

  // Until the client snapshot hydrates, render nothing personal — the server
  // editorial content above/below this component carries the first paint.
  if (!mounted) return null;

  if (!hasRoutine) {
    return (
      <section className="px-4">
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-sand bg-white/60 px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-moss/10 text-moss">
            <Icon name="today" size={24} />
          </span>
          <div>
            <p className="font-display text-xl text-ink">Start your Sweep Routine</p>
            <p className="mx-auto mt-1 max-w-[36ch] text-sm leading-relaxed text-ink/60">
              Save or enter sweepstakes and Today becomes your daily queue —
              what&apos;s ready, what&apos;s ending, and what&apos;s new.
            </p>
          </div>
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-full bg-moss px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-moss/90"
          >
            Find your first sweeps <Icon name="discover" size={16} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Routine summary strip */}
      <div className="mx-4 grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-card border border-sand bg-cream">
        <div className="px-3 py-4 text-center">
          <p className="font-display text-2xl text-moss">{readyCount}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink/60">
            Ready now
          </p>
        </div>
        <div className="px-3 py-4 text-center">
          <p className="font-display text-2xl text-ember">{endingToday.length}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink/60">
            Ending today
          </p>
        </div>
        <div className="px-3 py-4 text-center">
          <p className="font-display text-2xl text-ink">{buckets.entered.length}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink/60">
            In play
          </p>
        </div>
      </div>

      {buckets.readyAgain.length > 0 && (
        <Section
          icon="repeat"
          title="Ready again"
          subtitle="Entry windows that just re-opened for you"
          count={buckets.readyAgain.length}
        >
          <Rail listings={buckets.readyAgain.slice(0, MAX_SECTION_CARDS)} />
        </Section>
      )}

      {endingToday.length > 0 && (
        <Section
          icon="clock"
          title="Ending today"
          subtitle="Last call on sweeps you're tracking"
          count={endingToday.length}
        >
          <Rail listings={endingToday.slice(0, MAX_SECTION_CARDS)} />
        </Section>
      )}

      {buckets.ready.length > 0 && (
        <Section
          icon="bookmark"
          title="Saved, not entered"
          subtitle="You saved these — they're still open"
          count={buckets.ready.length}
        >
          <Rail listings={buckets.ready.slice(0, MAX_SECTION_CARDS)} />
        </Section>
      )}

      {endingSoonRest.length > 0 && (
        <Section
          icon="calendar"
          title="Ending soon"
          subtitle="Your tracked sweeps closing in the next few days"
          count={endingSoonRest.length}
        >
          <Rail listings={endingSoonRest.slice(0, MAX_SECTION_CARDS)} />
        </Section>
      )}

      {newSinceLastVisit.length > 0 && (
        <Section
          icon="sparkle"
          title="New since your last visit"
          subtitle="Fresh listings published while you were away"
          count={newSinceLastVisit.length}
        >
          <Rail listings={newSinceLastVisit} />
        </Section>
      )}

      {recent.length > 0 && (
        <section className="px-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink/5 text-ink/60">
              <Icon name="history" size={17} />
            </span>
            <h2 className="font-display text-2xl leading-none text-ink">
              Recent activity
            </h2>
          </div>
          <ul className="divide-y divide-sand overflow-hidden rounded-card border border-sand bg-cream">
            {recent.map((item) => {
              const meta =
                item.state !== "none" ? ACTIVITY_META[item.state] : null;
              if (!meta) return null;
              return (
                <li key={`${item.listing.id}-${item.state}`}>
                  <Link
                    href={`/sweeps/${item.listing.slug}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink/5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-moss/10 text-moss">
                      <Icon name={meta.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {item.listing.title}
                      </span>
                      <span className="block text-xs text-ink/55">
                        {meta.verb} {formatRelativeTime(item.at)}
                      </span>
                    </span>
                    <Icon name="caretRight" size={14} className="text-ink/35" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 px-1">
            <Link
              href="/my-sweeps"
              className="text-xs font-semibold text-moss transition hover:underline"
            >
              Open My Sweeps →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
