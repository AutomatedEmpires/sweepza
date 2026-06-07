"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { useSeekerState } from "@/lib/seeker-state";
import type { Listing } from "@/lib/types/listing";

type DashboardTab = "saved" | "entered" | "skipped";

const TABS: { id: DashboardTab; label: string }[] = [
  { id: "saved", label: "Saved" },
  { id: "entered", label: "Entered" },
  { id: "skipped", label: "Skipped" },
];

export function SeekerDashboard({ listings }: { listings: Listing[] }) {
  const [tab, setTab] = useState<DashboardTab>("saved");
  const store = useSeekerState();

  const filtered = useMemo(() => {
    if (!store) return [];
    return listings.filter((l) =>
      tab === "saved" ? store.isSaved(l.id) : store.getState(l.id) === tab,
    );
  }, [listings, store, tab]);

  const tabCounts = useMemo<Record<DashboardTab, number>>(() => {
    if (!store) return { saved: 0, entered: 0, skipped: 0 };
    return {
      saved: listings.filter((l) => store.isSaved(l.id)).length,
      entered: listings.filter((l) => store.getState(l.id) === "entered")
        .length,
      skipped: listings.filter((l) => store.getState(l.id) === "skipped")
        .length,
    };
  }, [listings, store]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            aria-label={`${t.label}, ${tabCounts[t.id]} items`}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-semibold transition",
              tab === t.id
                ? "bg-ink text-cream"
                : "border border-sand bg-white text-ink/60",
            )}
          >
            {t.label} ({tabCounts[t.id]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-sand bg-white/60 px-6 py-12 text-center">
          <Icon name="bookmark" size={36} className="text-ink/30" />
          <p className="text-sm font-medium text-ink">Nothing here yet</p>
          <p className="text-xs text-ink/55">
            Listings you {tab === "saved" ? "save" : tab} will show up on this tab.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
