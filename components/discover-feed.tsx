"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { FilterChips } from "@/components/filter-chips";
import { Icon } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { track } from "@/lib/analytics";
import {
  SORT_OPTIONS,
  filterListings,
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
  const store = useSeekerState();

  const visible = useMemo(() => {
    let result = filterListings(listings, active);
    if (hideSkipped && store) {
      result = result.filter((l) => store.getState(l.id) !== "skipped");
    }
    return sortListings(result, sort);
  }, [listings, active, sort, hideSkipped, store]);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <FilterChips active={active} onToggle={toggleChip} />
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-ink/45">Sort</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => changeSort(opt.id)}
              aria-pressed={sort === opt.id}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition",
                sort === opt.id ? "bg-ink text-cream" : "text-ink/55 hover:text-ink",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-sand bg-white/60 px-6 py-12 text-center">
          <Icon name="gift" size={40} className="text-ink/30" />
          <p className="text-sm font-medium text-ink">
            No sweepstakes match these filters
          </p>
          <p className="text-xs text-ink/55">
            Try clearing filters or browsing a broader set.
          </p>
          <button
            type="button"
            onClick={() => setActive([])}
            className="rounded-full bg-ember px-4 py-2 text-xs font-semibold text-cream"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((listing) => (
            <ListingCard key={listing.id} listing={listing} surface="scroll" />
          ))}
        </div>
      )}
    </div>
  );
}
