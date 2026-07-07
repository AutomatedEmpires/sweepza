"use client";

import { useEffect, useMemo, useState } from "react";
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
        <span className="text-xs text-ink/60">{countLabel}</span>
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
          <Icon name={query ? "search" : "gift"} size={40} className="text-ink/30" />
          <p className="text-sm font-medium text-ink">
            {query
              ? `Nothing matches “${query}”`
              : "No sweepstakes match your filters"}
          </p>
          <p className="text-xs text-ink/55">
            {query
              ? "Try fewer words, a host name, or a prize category."
              : "Try clearing filters or browsing a broader set."}
          </p>
          {hasActiveControls && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-full bg-ember px-4 py-2 text-xs font-semibold text-cream"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
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
