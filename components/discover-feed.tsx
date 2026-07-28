"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { searchAnalyticsMetrics } from "@/lib/search-analytics";
import { useSeekerState } from "@/lib/seeker-state";
import type { Listing } from "@/lib/types/listing";

export function DiscoverFeed({
  listings,
  query = "",
  initialFilters = [],
  initialSort = "recommended",
  category,
  hideSkipped = true,
}: {
  listings: Listing[];
  /** Active full-text query (already applied server-side) for labels/analytics. */
  query?: string;
  initialFilters?: FilterChipId[];
  initialSort?: SortId;
  category?: string;
  hideSkipped?: boolean;
}) {
  const [active, setActive] = useState<FilterChipId[]>(initialFilters);
  const [sort, setSort] = useState<SortId>(initialSort);
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const store = useSeekerState();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    setActive(initialFilters);
    setSort(initialSort);
    setSelectedCategory(category);
  }, [category, initialFilters, initialSort]);

  const visible = useMemo(() => {
    let result = filterListings(listings, active);
    if (hideSkipped && store) {
      result = result.filter((l) => store.getState(l.id) !== "skipped");
    }
    return sortListings(result, sort);
  }, [listings, active, sort, hideSkipped, store]);

  useEffect(() => {
    const searchMetrics = searchAnalyticsMetrics(query);
    if (query) {
      track("search_results_shown", {
        ...searchMetrics,
        result_count: listings.length,
      });
    }
    track("discover_feed_loaded", {
      count: visible.length,
      sort,
      ...searchMetrics,
    });
    // Fire once per feed load (new query = new server render = new mount data).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function syncUrl(
    nextActive: FilterChipId[],
    nextSort: SortId,
    nextCategory = selectedCategory,
  ) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextActive.length > 0) params.set("filters", nextActive.join(","));
    else params.delete("filters");
    if (nextSort !== "recommended") params.set("sort", nextSort);
    else params.delete("sort");
    if (nextCategory) params.set("category", nextCategory);
    else params.delete("category");
    const serialized = params.toString();
    router.replace(serialized ? `/discover?${serialized}` : "/discover", {
      scroll: false,
    });
  }

  function toggleChip(id: FilterChipId) {
    const willEnable = !active.includes(id);
    const next = willEnable
      ? [...active, id]
      : active.filter((chip) => chip !== id);
    track("filter_applied", { filter_key: id, value: willEnable });
    setActive(next);
    syncUrl(next, sort);
  }

  function changeSort(next: SortId) {
    setSort(next);
    track("filter_applied", { filter_key: "sort", value: next });
    syncUrl(active, next);
  }

  function changeCategory(next?: string) {
    setSelectedCategory(next);
    track("filter_applied", {
      filter_key: "category",
      value: next ? "selected" : "all",
    });
    syncUrl(active, sort, next);
  }

  function clearAll() {
    setActive([]);
    setSort("recommended");
    setSelectedCategory(undefined);
    track("filter_applied", { filter_key: "clear_all", value: true });
    syncUrl([], "recommended", undefined);
  }

  const activeControlCount =
    active.length +
    (sort === "recommended" ? 0 : 1) +
    (selectedCategory ? 1 : 0);
  const hasActiveControls = activeControlCount > 0;
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
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 text-xs font-semibold text-ink/70 transition hover:border-ink/25"
        >
          <Icon name="filter" size={14} />
          Filters
          {activeControlCount > 0 ? (
            <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-ember px-1 text-[10px] font-bold text-on-accent">
              {activeControlCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex min-h-6 items-center justify-between px-0.5">
        {/* Announce result-count changes as filters/search narrow the feed. */}
        <span aria-live="polite" className="text-xs text-graphite">
          {countLabel}
        </span>
        {hasActiveControls ? (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-11 px-2 text-xs font-semibold text-ember transition hover:text-ember/80"
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
              className="inline-flex min-h-11 items-center justify-center mt-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
            >
              Clear filters
            </button>
          ) : query ? (
            <Link
              href="/discover"
              className="inline-flex min-h-11 items-center justify-center mt-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
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
        category={selectedCategory}
        onCategory={changeCategory}
        onClear={clearAll}
        resultCount={visible.length}
      />
    </div>
  );
}
