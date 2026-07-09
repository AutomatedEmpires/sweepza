"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { cn } from "@/lib/cn";
import { daysUntil } from "@/lib/listing-badges";
import { formatRelativeTime } from "@/lib/listing-format";
import { useSeekerState } from "@/lib/seeker-state";
import {
  EMPTY_ROUTINE_SNAPSHOT,
  buildRecentActivity,
  buildRoutineBuckets,
} from "@/lib/sweep-routine";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

// Today — the daily sweepstakes routine. It answers, in order: what needs me
// now, what's ready again, what's ending, what's new, what I've handled. The
// system decides the "next best action"; the user reads the day in one glance.

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
      <div className="px-1 lg:max-w-md">
        <ListingCard listing={listings[0]} />
      </div>
    );
  }
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:overflow-visible xl:grid-cols-3">
      {listings.map((listing) => (
        <div
          key={listing.id}
          className="w-[86%] shrink-0 snap-center sm:w-[340px] lg:w-auto"
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
    <section className="px-4 lg:px-0">
      <div className="mb-3.5 flex items-center gap-2.5 px-1 lg:px-0">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/5 text-ink/70">
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[26px] leading-none text-ink">
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-graphite">{subtitle}</p>
        </div>
        <span className="nums rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold text-ink/60">
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
    try {
      const previous = window.localStorage.getItem(LAST_VISIT_KEY);
      startTransition(() => {
        setMounted(true);
        setLastVisitAt(previous);
      });
      window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    } catch {
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

  const endingToday = buckets.endingSoon.filter((l) => daysUntil(l.endDate) <= 0);
  const endingSoonRest = buckets.endingSoon.filter((l) => daysUntil(l.endDate) > 0);

  const readyCount = buckets.ready.length + buckets.readyAgain.length;
  const hasRoutine =
    readyCount > 0 ||
    buckets.endingSoon.length > 0 ||
    recent.length > 0 ||
    buckets.entered.length > 0;

  if (!mounted) return null;

  // ---- Empty / onboarding ----
  if (!hasRoutine) {
    return (
      <section className="px-4 lg:px-0">
        <div className="flex flex-col items-center gap-4 rounded-sheet border border-line bg-surface px-6 py-12 text-center shadow-e1">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-ember/10 text-ember">
            <Icon name="today" size={26} />
          </span>
          <div>
            <p className="font-display text-2xl text-ink">
              Start your sweep routine
            </p>
            <p className="mx-auto mt-1.5 max-w-[42ch] text-sm leading-relaxed text-graphite">
              Save or enter a few sweepstakes and Today becomes your daily
              queue — what&apos;s ready, what&apos;s ending, and what you won.
              Sweepza remembers so you don&apos;t have to.
            </p>
          </div>
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            Find your first sweeps <Icon name="discover" size={16} />
          </Link>
        </div>
      </section>
    );
  }

  // ---- Next best action ----
  const nba =
    endingToday.length > 0
      ? {
          tone: "urgent" as const,
          eyebrow: "Ends today",
          headline:
            endingToday.length === 1
              ? "One sweep you're tracking ends today"
              : `${endingToday.length} sweeps you're tracking end today`,
          sub: "Enter before they close — this is the last call.",
          listing: endingToday[0],
        }
      : buckets.readyAgain.length > 0
        ? {
            tone: "again" as const,
            eyebrow: "Ready again",
            headline:
              buckets.readyAgain.length === 1
                ? "A daily entry just re-opened"
                : `${buckets.readyAgain.length} entry windows re-opened`,
            sub: "Your recurring sweeps are ready for another entry.",
            listing: buckets.readyAgain[0],
          }
        : buckets.ready.length > 0
          ? {
              tone: "open" as const,
              eyebrow: "Ready to enter",
              headline:
                buckets.ready.length === 1
                  ? "You saved one you haven't entered yet"
                  : `${buckets.ready.length} saved sweeps are waiting`,
              sub: "You liked these — they're still open.",
              listing: buckets.ready[0],
            }
          : null;

  const clearForToday = !nba;

  return (
    <div className="flex flex-col gap-9">
      {/* Intelligence strip */}
      <div className="mx-4 grid grid-cols-3 overflow-hidden rounded-card border border-line bg-surface shadow-e1 lg:mx-0">
        {[
          { n: readyCount, label: "Ready now", tone: "text-pine" },
          { n: endingToday.length, label: "End today", tone: "text-flame" },
          { n: buckets.entered.length, label: "In play", tone: "text-ink" },
        ].map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "px-3 py-4 text-center",
              i > 0 && "border-l border-line",
            )}
          >
            <p className={cn("nums font-display text-3xl leading-none", s.tone)}>
              {s.n}
            </p>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-graphite">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Next best action hero */}
      {nba && (
        <section className="px-4 lg:px-0">
          <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-8 lg:rounded-sheet lg:border lg:border-line lg:bg-surface lg:p-6 lg:shadow-e1">
            <div className="mb-4 lg:mb-0">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]",
                  nba.tone === "urgent"
                    ? "text-flame"
                    : nba.tone === "again"
                      ? "text-pine"
                      : "text-ember",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    nba.tone === "urgent"
                      ? "bg-flame animate-pulse-urgent"
                      : nba.tone === "again"
                        ? "bg-pine"
                        : "bg-ember",
                  )}
                />
                Your next best action · {nba.eyebrow}
              </span>
              <h2 className="mt-2 font-display text-[30px] leading-[1.1] text-ink lg:text-4xl">
                {nba.headline}
              </h2>
              <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-graphite">
                {nba.sub}
              </p>
            </div>
            <div className="lg:max-w-md">
              <ListingCard listing={nba.listing} priority />
            </div>
          </div>
        </section>
      )}

      {clearForToday && (
        <section className="px-4 lg:px-0">
          <div className="flex flex-col items-center gap-3 rounded-sheet border border-pine/25 bg-pine/[0.06] px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-pine text-white">
              <Icon name="check" size={24} />
            </span>
            <p className="font-display text-2xl text-ink">You&apos;re clear for today</p>
            <p className="max-w-[40ch] text-sm text-graphite">
              Nothing needs you right now. Sweepza is watching your saved and
              recurring sweeps — you&apos;ll see them here the moment they&apos;re ready.
            </p>
          </div>
        </section>
      )}

      {/* Routine sections (skip the one already surfaced as NBA) */}
      {buckets.readyAgain.length > 0 && nba?.tone !== "again" && (
        <Section
          icon="repeat"
          title="Ready again"
          subtitle="Entry windows that just re-opened for you"
          count={buckets.readyAgain.length}
        >
          <Rail listings={buckets.readyAgain.slice(0, MAX_SECTION_CARDS)} />
        </Section>
      )}

      {endingToday.length > 0 && nba?.tone !== "urgent" && (
        <Section
          icon="clock"
          title="Ending today"
          subtitle="Last call on sweeps you're tracking"
          count={endingToday.length}
        >
          <Rail listings={endingToday.slice(0, MAX_SECTION_CARDS)} />
        </Section>
      )}

      {buckets.ready.length > 0 && nba?.tone !== "open" && (
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
        <section className="px-4 lg:px-0">
          <div className="mb-3.5 flex items-center gap-2.5 px-1 lg:px-0">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink/5 text-ink/70">
              <Icon name="history" size={16} />
            </span>
            <h2 className="font-display text-[26px] leading-none text-ink">
              Recently handled
            </h2>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-e1">
            {recent.map((item) => {
              const meta =
                item.state !== "none" ? ACTIVITY_META[item.state] : null;
              if (!meta) return null;
              return (
                <li key={`${item.listing.id}-${item.state}`}>
                  <Link
                    href={`/sweeps/${item.listing.slug}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink/[0.03]"
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                        item.state === "won"
                          ? "bg-gold/15 text-gold"
                          : "bg-pine/12 text-pine",
                      )}
                    >
                      <Icon name={meta.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {item.listing.title}
                      </span>
                      <span className="block text-xs text-graphite">
                        {meta.verb} {formatRelativeTime(item.at)}
                      </span>
                    </span>
                    <Icon name="caretRight" size={14} className="text-ink/30" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 px-1 lg:px-0">
            <Link
              href="/my-sweeps"
              className="text-sm font-semibold text-ember transition hover:underline"
            >
              Open My Sweeps →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
