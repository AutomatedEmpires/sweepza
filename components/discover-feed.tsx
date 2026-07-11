"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FilterChips } from "@/components/filter-chips";
import { FilterDrawer } from "@/components/filter-drawer";
import { SearchInput } from "@/components/search-input";
import { Icon } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { track } from "@/lib/analytics";
import {
  filterListings,
  sortListings,
  type FilterChipId,
  type SortId,
} from "@/lib/listing-filters";
import { useSeekerState } from "@/lib/seeker-state";
import type { Listing } from "@/lib/types/listing";

export function DiscoverFeed({
  listings,
  query = "",
  hideSkipped = true,
}: {
  listings: Listing[];
  /** Active full-text query (already applied server-side) for labels/analytics. */
  query?: string;
  hideSkipped?: boolean;
}) {
  const [active, setActive] = useState<FilterChipId[]>([]);
  const [sort, setSort] = useState<SortId>("recommended");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const store = useSeekerState();

  const visible = useMemo(() => {
    let result = filterListings(listings, active);
    if (hideSkipped && store) {
      result = result.filter((l) => store.getState(l.id) !== "skipped");
    }
    return sortListings(result, sort);
  }, [listings, active, sort, hideSkipped, store]);

  useEffect(() => {
    if (query) {
      track("search_results_shown", { query, result_count: listings.length });
    }
    track("discover_feed_loaded", { count: visible.length, sort, ...(query ? { query } : {}) });
    // Fire once per feed load (new query = new server render = new mount data).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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
    track("filter_applied", { filter_key: "clear_all", value: true });
  }

  const hasActiveControls = active.length > 0;
  const countLabel = query
    ? `${visible.length} ${visible.length === 1 ? "sweep" : "sweeps"} matching “${query}”`
    : visible.length === 1
      ? "1 sweep"
      : `${visible.length} sweeps`;

  return (
    <div className="flex flex-col gap-4">
      <SearchInput />

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <FilterChips active={active} onToggle={toggleChip} />
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-ink/25"
        >
          <Icon name="filter" size={14} />
          Filters
          {active.length > 0 ? (
            <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-ember px-1 text-[10px] font-bold text-white">
              {active.length}
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs text-graphite">{countLabel}</span>
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
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-ember/10 text-ember">
            <Icon name={query ? "search" : "gift"} size={26} />
          </span>
          <p className="font-display text-xl text-ink">
            {query
              ? `Nothing matches “${query}”`
              : "No sweepstakes match your filters"}
          </p>
          <p className="max-w-xs text-sm text-graphite">
            {query
              ? "Try fewer words, a host name, or a prize category."
              : "Try clearing filters or browsing a broader set."}
          </p>
          {hasActiveControls ? (
            <button
              type="button"
              onClick={clearAll}
              className="mt-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              Clear filters
            </button>
          ) : query ? (
            <Link
              href="/discover"
              className="mt-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              Browse all sweeps
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
