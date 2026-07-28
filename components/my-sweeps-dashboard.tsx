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
import {
  buildMySweepsHistory,
  filterAndSortMySweepsListings,
  type MySweepsHistoryItem,
  type MySweepsSort,
} from "@/lib/my-sweeps-control-center";
import { formatRelativeTime } from "@/lib/listing-format";
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

type MySweepsViewId = RoutineBucketId | "history";

const TABS: {
  id: MySweepsViewId;
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
      body: "After using the official entry page, confirm your entry to track it here.",
    },
  },
  {
    id: "readyAgain",
    label: "Ready Again",
    icon: "repeat",
    empty: {
      title: "No re-entries open",
      body: "Daily and weekly sweeps show here when their next entry window is available.",
    },
  },
  {
    id: "endingSoon",
    label: "Ending Soon",
    icon: "clock",
    empty: {
      title: "Nothing closing soon",
      body: "Saved or entered sweeps ending within 3 days show here so closing dates stay visible.",
    },
  },
  {
    id: "history",
    label: "History",
    icon: "history",
    empty: {
      title: "No sweep history yet",
      body: "Save, enter, skip, or report a win and that listing will appear here.",
    },
  },
  {
    id: "won",
    label: "Won",
    icon: "trophy",
    empty: {
      title: "No wins reported yet",
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

const HISTORY_STATE_TONE: Record<MySweepsHistoryItem["state"], string> = {
  saved: "bg-ember/10 text-ember",
  entered: "bg-pine/10 text-pine",
  skipped: "bg-ink/5 text-graphite",
  won: "bg-gold/10 text-gold",
};

function HistoryStateBar({
  item,
  now,
  onRestore,
}: {
  item: MySweepsHistoryItem;
  now: Date;
  onRestore?: (listing: Listing) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Tracking state for ${item.listing.title}`}
      className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex min-h-7 items-center rounded-pill px-2.5 text-xs font-semibold",
            HISTORY_STATE_TONE[item.state],
          )}
        >
          {item.stateLabel}
        </span>
        {item.activityAt ? (
          <time
            dateTime={item.activityAt}
            className="text-xs text-graphite"
          >
            Activity {formatRelativeTime(item.activityAt, now)}
          </time>
        ) : null}
      </div>
      {item.state === "skipped" && onRestore ? (
        <button
          type="button"
          onClick={() => onRestore(item.listing)}
          aria-label={`Restore ${item.listing.title} from skipped`}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold text-ink/75 transition hover:border-ink/25 hover:text-ink"
        >
          <Icon name="repeat" size={14} />
          Restore
        </button>
      ) : null}
    </div>
  );
}

export function MySweepsDashboard({ listings }: { listings: Listing[] }) {
  const [tab, setTab] = useState<MySweepsViewId>("ready");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MySweepsSort>("deadline");
  const [statusMessage, setStatusMessage] = useState("");
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

  const historyItems = useMemo(
    () => buildMySweepsHistory(allListings, snapshot),
    [allListings, snapshot],
  );
  const historyById = useMemo(
    () => new Map(historyItems.map((item) => [item.listing.id, item])),
    [historyItems],
  );

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];
  const baseListings = useMemo(
    () =>
      activeTab.id === "history"
        ? historyItems.map((item) => item.listing)
        : buckets[activeTab.id],
    [activeTab.id, buckets, historyItems],
  );
  const activeListings = useMemo(
    () =>
      filterAndSortMySweepsListings(
        baseListings,
        snapshot,
        query,
        sort,
        now,
      ),
    [baseListings, snapshot, query, sort, now],
  );

  const viewCounts = useMemo<Record<MySweepsViewId, number>>(
    () => ({
      ready: buckets.ready.length,
      saved: buckets.saved.length,
      entered: buckets.entered.length,
      readyAgain: buckets.readyAgain.length,
      endingSoon: buckets.endingSoon.length,
      history: historyItems.length,
      won: buckets.won.length,
      skipped: buckets.skipped.length,
    }),
    [buckets, historyItems],
  );

  const readyNowCount = useMemo(
    () =>
      new Set(
        [...buckets.ready, ...buckets.readyAgain].map((listing) => listing.id),
      ).size,
    [buckets.ready, buckets.readyAgain],
  );

  function restoreSkipped(listing: Listing) {
    if (!store) return;
    store.setPrimaryState(listing.id, "none");
    setStatusMessage(`Restore requested for ${listing.title}.`);
  }

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
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      <dl
        aria-label="My Sweeps summary"
        className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface shadow-e1 sm:grid-cols-4"
      >
        {[
          { label: "Tracked", value: historyItems.length },
          { label: "Ready now", value: readyNowCount },
          { label: "Ending soon", value: buckets.endingSoon.length },
          { label: "Wins reported", value: buckets.won.length },
        ].map((metric, index) => (
          <div
            key={metric.label}
            className={cn(
              "flex flex-col px-4 py-3",
              index % 2 === 1 && "border-l border-line",
              index >= 2 && "border-t border-line sm:border-t-0",
              index === 2 && "sm:border-l",
            )}
          >
            <dt className="order-2 mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-graphite">
              {metric.label}
            </dt>
            <dd className="nums order-1 font-display text-2xl leading-none text-ink">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-2 rounded-card border border-line bg-surface p-3 shadow-e1 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <label htmlFor="my-sweeps-search" className="sr-only">
            Search tracked sweeps by title, prize, or sponsor
          </label>
          <Icon
            name="search"
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite"
          />
          <input
            id="my-sweeps-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, prize, or sponsor"
            aria-describedby="my-sweeps-result-count"
            className="min-h-11 w-full rounded-xl border border-line bg-paper py-2 pl-10 pr-3 text-sm text-ink outline-none transition placeholder:text-graphite/70 focus:border-ink/30 focus:ring-2 focus:ring-ember/25"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="my-sweeps-sort" className="sr-only">
            Sort My Sweeps
          </label>
          <select
            id="my-sweeps-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as MySweepsSort)}
            className="min-h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm font-semibold text-ink outline-none transition focus:border-ink/30 focus:ring-2 focus:ring-ember/25 sm:w-auto"
          >
            <option value="deadline">Deadline</option>
            <option value="recent">Recent activity</option>
            <option value="value">Prize value</option>
          </select>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="My Sweeps views"
        onKeyDown={onTablistKeyDown}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
      >
        {TABS.map((t) => {
          const count = viewCounts[t.id];
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
              <span
                className={cn(
                  "nums rounded-pill px-1.5 text-xs font-bold",
                  active ? "bg-paper/20 text-paper" : "bg-ink/5 text-ink/50",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-5 items-center justify-between gap-3 px-1 text-xs text-graphite">
        <p id="my-sweeps-result-count" aria-live="polite">
          {query.trim()
            ? `${activeListings.length} of ${baseListings.length} matching`
            : `${baseListings.length} ${
                baseListings.length === 1 ? "listing" : "listings"
              }`}
        </p>
        <p className="font-medium text-ink/65">{activeTab.label}</p>
      </div>

      <div
        id={`my-sweeps-panel-${activeTab.id}`}
        role="tabpanel"
        aria-labelledby={`my-sweeps-tab-${activeTab.id}`}
      >
        {activeListings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center shadow-e1">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-paper text-ink/40">
              <Icon
                name={baseListings.length > 0 ? "search" : activeTab.icon}
                size={26}
              />
            </div>
            <p className="font-display text-[20px] leading-none text-ink">
              {baseListings.length > 0
                ? `No matches in ${activeTab.label}`
                : activeTab.empty.title}
            </p>
            <p className="max-w-[38ch] text-sm leading-relaxed text-graphite">
              {baseListings.length > 0
                ? "Try another title, prize, or sponsor."
                : activeTab.empty.body}
            </p>
            {baseListings.length > 0 ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink/75 transition hover:bg-paper hover:text-ink"
              >
                Clear search
              </button>
            ) : null}
            {baseListings.length === 0 &&
            (tab === "ready" || tab === "saved" || tab === "history") ? (
              <Link
                href="/discover"
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
              >
                Discover sweeps <Icon name="discover" size={15} />
              </Link>
            ) : null}
            {baseListings.length === 0 && tab === "won" ? (
              <Link
                href="/winners"
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink/75 transition hover:bg-paper"
              >
                Visit the Winner Wall <Icon name="trophy" size={15} />
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {activeListings.map((listing) => {
              const historyItem = historyById.get(listing.id);
              const showHistoryState =
                historyItem &&
                (activeTab.id === "history" || activeTab.id === "skipped");

              return (
                <div key={listing.id} className="flex min-w-0 flex-col gap-2">
                  {showHistoryState ? (
                    <HistoryStateBar
                      item={historyItem}
                      now={now}
                      onRestore={store ? restoreSkipped : undefined}
                    />
                  ) : null}
                  <ListingCard listing={listing} variant="compact" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
