"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterChips } from "@/components/filter-chips";
import { FilterDrawer } from "@/components/filter-drawer";
import { Icon } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { track } from "@/lib/analytics";
import {
  filterListings,
  searchListings,
  sortListings,
  type FilterChipId,
  type SortId,
} from "@/lib/listing-filters";
import { useSeekerState } from "@/lib/seeker-state";
import type { Listing } from "@/lib/types/listing";

export function DiscoverFeed({
  listings,
  hideSkipped = true,
}: {
  listings: Listing[];
  hideSkipped?: boolean;
}) {
  const [active, setActive] = useState<FilterChipId[]>([]);
  const [sort, setSort] = useState<SortId>("recommended");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const store = useSeekerState();

  const visible = useMemo(() => {
    let result = filterListings(listings, active);
    result = searchListings(result, query);
    if (hideSkipped && store) {
      result = result.filter((l) => store.getState(l.id) !== "skipped");
    }
    return sortListings(result, sort);
  }, [listings, active, query, sort, hideSkipped, store]);

  useEffect(() => {
    track("discover_feed_loaded", { count: visible.length, sort });
    // Fire once on mount for the initial feed load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleChip(id: FilterChipId) {
    setActive((cur) => {
      const willEnable = !cur.includes(id);
      track("filter_applied", { filter_key: id, value: willEnable });
      return willEnable ? [...cur, id] : cur.filter((c) => c !== id);
    });
  }

  function changeSort(next: SortId) {
    setSort(next);
    track("filter_applied", { filter_key: "sort", value: next });
  }

  function clearAll() {
    setActive([]);
    setQuery("");
    track("filter_applied", { filter_key: "clear_all", value: true });
  }

  function submitSearch() {
    const q = query.trim();
    if (q) track("filter_applied", { filter_key: "search", value: q });
  }

  const hasActiveControls = active.length > 0 || query.trim().length > 0;
  const countLabel = visible.length === 1 ? "1 sweep" : `${visible.length} sweeps`;

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}
        className="flex items-center gap-2 rounded-full border border-sand bg-white px-3.5 py-2"
      >
        <Icon name="search" size={16} className="shrink-0 text-ink/40" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search prizes, hosts, tags…"
          aria-label="Search sweepstakes"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="shrink-0 text-ink/40 transition hover:text-ink"
          >
            <Icon name="skip" size={14} />
          </button>
        ) : null}
      </form>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <FilterChips active={active} onToggle={toggleChip} />
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sand bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-ink/20"
        >
          <Icon name="filter" size={14} />
          Filters
          {active.length > 0 ? (
            <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-ember px-1 text-[10px] font-bold text-cream">
              {active.length}
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs text-ink/45">{countLabel}</span>
        {hasActiveControls ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-ember transition hover:text-ember/80"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-sand bg-white/60 px-6 py-12 text-center">
          <Icon name="gift" size={40} className="text-ink/30" />
          <p className="text-sm font-medium text-ink">
            No sweepstakes match your search or filters
          </p>
          <p className="text-xs text-ink/55">
            Try a different term or clear what you have applied.
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full bg-ember px-4 py-2 text-xs font-semibold text-cream"
          >
            Clear all
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((listing) => (
            <ListingCard key={listing.id} listing={listing} surface="scroll" />
          ))}
        </div>
      )}

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={active}
        onToggle={toggleChip}
        sort={sort}
        onSort={changeSort}
        onClear={clearAll}
        resultCount={visible.length}
      />
    </div>
  );
}
