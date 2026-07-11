"use client";

import { ListingCard } from "@/components/listing-card";
import {
  SeekerStateProvider,
  type SeekerStateSnapshot,
} from "@/lib/seeker-state";
import type { Listing } from "@/lib/types/listing";

// Client board for /visual-review. Wraps the fixtures in a seeded seeker-state
// provider (so Won / Entered / Saved / Ready-again contexts render) without
// touching real production state.
export function VisualReviewBoard({
  listings,
  snapshot,
}: {
  listings: Listing[];
  snapshot: SeekerStateSnapshot;
}) {
  const featured = listings.find((l) => l.isFeatured) ?? listings[0];
  const rest = listings.filter((l) => l.id !== featured.id);

  return (
    // persistenceMode "remote" so it does not read localStorage and clobber the
    // seeded snapshot; interaction POSTs fail silently on the review route.
    <SeekerStateProvider initial={snapshot} persistenceMode="remote">
      <div className="flex flex-col gap-10">
        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">Featured stage</h2>
          <div className="lg:max-w-2xl">
            <ListingCard listing={featured} tone="featured" priority />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">
            Standard grid — every state
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rest.map((l) => (
              <ListingCard key={l.id} listing={l} surface="scroll" />
            ))}
          </div>
        </section>
      </div>
    </SeekerStateProvider>
  );
}
