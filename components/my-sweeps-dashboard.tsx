"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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

    const idsToFetch = missing.slice(0, 100);
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((id) => fetchedIdsRef.current.add(id));

    const controller = new AbortController();
    fetch(`/api/listings?ids=${idsToFetch.join(",")}`, {
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

  // ARIA tabs contract: one tab stop for the whole list (roving tabindex),
  // arrows/Home/End move selection, each tab controls a named panel.
  function onTablistKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === activeTab.id);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === -1) return;
    event.preventDefault();
    const id = TABS[next].id;
    setTab(id);
    document.getElementById(`my-sweeps-tab-${id}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="My Sweeps views"
        onKeyDown={onTablistKeyDown}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
      >
        {TABS.map((t) => {
          const count = buckets[t.id].length;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              id={`my-sweeps-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              // Only the selected panel is rendered, so only the selected tab
              // may reference it — a broken aria-controls id is worse than none.
              aria-controls={active ? `my-sweeps-panel-${t.id}` : undefined}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-sm font-semibold transition",
                active
                  ? "bg-ink text-paper"
                  : "border border-line bg-surface text-ink/60 hover:text-ink",
              )}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
              {count > 0 && (
                <span
                  className={cn(
                    "nums rounded-pill px-1.5 text-xs font-bold",
                    active ? "bg-paper/20 text-paper" : "bg-ink/5 text-ink/50",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id={`my-sweeps-panel-${activeTab.id}`}
        role="tabpanel"
        aria-labelledby={`my-sweeps-tab-${activeTab.id}`}
      >
      {activeListings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center shadow-e1">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-paper text-ink/40">
            <Icon name={activeTab.icon} size={26} />
          </div>
          <p className="font-display text-[20px] leading-none text-ink">
            {activeTab.empty.title}
          </p>
          <p className="max-w-[38ch] text-sm leading-relaxed text-graphite">
            {activeTab.empty.body}
          </p>
          {(tab === "ready" || tab === "saved") && (
            <Link
              href="/discover"
              className="min-h-11 mt-2 inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
            >
              Discover sweeps <Icon name="discover" size={15} />
            </Link>
          )}
          {tab === "won" && (
            <Link
              href="/winners"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink/75 transition hover:bg-paper"
            >
              Visit the Winner Wall <Icon name="trophy" size={15} />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
