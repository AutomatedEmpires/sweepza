"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { useNow } from "@/lib/now";
import { useSeekerState } from "@/lib/seeker-state";
import {
  EMPTY_ROUTINE_SNAPSHOT,
  buildRoutineBuckets,
  type RoutineBucketId,
} from "@/lib/sweep-routine";
import type { Listing } from "@/lib/types/listing";

// My Sweeps — the seeker control center. One canonical state system
// (lib/sweep-routine over the seeker-state snapshot) drives every view.
// State language: saved/entered/skipped/won are user-reported actions;
// Ready, Ready Again, and Ending Soon are computed from those actions plus
// the listing's own dates and entry frequency.

const TABS: {
  id: RoutineBucketId;
  label: string;
  icon: IconName;
  empty: { title: string; body: string };
}[] = [
  {
    id: "ready",
    label: "Ready",
    icon: "send",
    empty: {
      title: "Nothing ready right now",
      body: "Save sweeps you want to enter and they queue up here until you do.",
    },
  },
  {
    id: "saved",
    label: "Saved",
    icon: "bookmark",
    empty: {
      title: "No saved sweeps yet",
      body: "Tap the bookmark on any listing to keep it here.",
    },
  },
  {
    id: "entered",
    label: "Entered",
    icon: "check",
    empty: {
      title: "No entries tracked yet",
      body: "When you enter a sweep through Sweepza, it's tracked here automatically.",
    },
  },
  {
    id: "readyAgain",
    label: "Ready Again",
    icon: "repeat",
    empty: {
      title: "No re-entries open",
      body: "Enter a daily or weekly sweep and it comes back here the moment the window re-opens.",
    },
  },
  {
    id: "endingSoon",
    label: "Ending Soon",
    icon: "clock",
    empty: {
      title: "Nothing closing soon",
      body: "Saved or entered sweeps ending within 3 days show up here — so you never miss a deadline.",
    },
  },
  {
    id: "won",
    label: "Won",
    icon: "trophy",
    empty: {
      title: "No wins yet — keep going",
      body: "Wins you report land here. Share them on the Winner Wall when they happen.",
    },
  },
  {
    id: "skipped",
    label: "Skipped",
    icon: "skip",
    empty: {
      title: "Nothing skipped",
      body: "Skip a sweep and it stays out of your way here instead of your feed.",
    },
  },
];

export function MySweepsDashboard({ listings }: { listings: Listing[] }) {
  const [tab, setTab] = useState<RoutineBucketId>("ready");
  const [extra, setExtra] = useState<Listing[]>([]);
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const store = useSeekerState();
  const now = useNow();

  const snapshot = store?.snapshot ?? EMPTY_ROUTINE_SNAPSHOT;

  const allListings = useMemo(() => {
    if (extra.length === 0) return listings;
    const seen = new Set(listings.map((l) => l.id));
    return [...listings, ...extra.filter((l) => !seen.has(l.id))];
  }, [listings, extra]);

  // Local (device-only) seekers can hold state for listings older than the
  // feed window the server rendered — hydrate those by id.
  useEffect(() => {
    const known = new Set(allListings.map((l) => l.id));
    const missing = [
      ...new Set([
        ...Object.keys(snapshot.saved),
        ...Object.keys(snapshot.activity),
        ...Object.keys(snapshot.primary).filter(
          (id) => snapshot.primary[id] !== "none",
        ),
      ]),
    ].filter((id) => !known.has(id) && !fetchedIdsRef.current.has(id));

    if (missing.length === 0) return;
    missing.forEach((id) => fetchedIdsRef.current.add(id));

    const controller = new AbortController();
    fetch(`/api/listings?ids=${missing.slice(0, 100).join(",")}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: Listing[] } | null) => {
        if (payload?.data?.length) {
          // Transition: never force still-hydrating boundaries to client-render.
          startTransition(() => {
            setExtra((current) => [...current, ...payload.data!]);
          });
        }
      })
      .catch(() => {
        // Missing listings simply stay absent; buckets render what's known.
      });

    return () => controller.abort();
  }, [snapshot, allListings]);

  const buckets = useMemo(
    () => buildRoutineBuckets(allListings, snapshot, now),
    [allListings, snapshot, now],
  );

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];
  const activeListings = buckets[activeTab.id];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="My Sweeps views"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {TABS.map((t) => {
          const count = buckets[t.id].length;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                active
                  ? "bg-ink text-cream"
                  : "border border-sand bg-white text-ink/60",
              )}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
              {count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs font-bold",
                    active ? "bg-cream/20 text-cream" : "bg-ink/5 text-ink/50",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeListings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-sand bg-white/60 px-6 py-12 text-center">
          <Icon name={activeTab.icon} size={36} className="text-ink/30" />
          <p className="text-sm font-medium text-ink">{activeTab.empty.title}</p>
          <p className="max-w-[38ch] text-xs leading-relaxed text-ink/55">
            {activeTab.empty.body}
          </p>
          {(tab === "ready" || tab === "saved") && (
            <Link
              href="/discover"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
            >
              Discover sweeps <Icon name="discover" size={15} />
            </Link>
          )}
          {tab === "won" && (
            <Link
              href="/winners"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
            >
              Visit the Winner Wall <Icon name="trophy" size={15} />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {activeListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
