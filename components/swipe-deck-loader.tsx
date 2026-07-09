"use client";

import nextDynamic from "next/dynamic";

// SwipeDeck carries gesture/drag + throw-animation logic that only matters
// once a user is actually swiping — code-split it out of the initial
// Discover route bundle instead of shipping it on first paint. `ssr: false`
// isn't allowed directly inside a Server Component (app/discover/swipe/page
// .tsx fetches data server-side), so this thin client boundary exists purely
// to host the dynamic import.
export const SwipeDeck = nextDynamic(
  () => import("@/components/swipe-deck").then((mod) => mod.SwipeDeck),
  { ssr: false, loading: () => <SwipeDeckSkeleton /> },
);

function SwipeDeckSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 pb-6 pt-2">
      <div className="h-3 w-24 animate-pulse rounded bg-ink/[0.06]" />
      <div className="w-full overflow-hidden rounded-card border border-line bg-surface shadow-e1">
        <div className="aspect-[16/11] w-full animate-pulse bg-line" />
        <div className="flex flex-col p-4">
          <div className="h-5 w-3/5 animate-pulse rounded bg-ink/[0.06]" />
          <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-ink/[0.06]" />
          <div className="mt-1.5 h-3 w-2/5 animate-pulse rounded bg-ink/[0.06]" />
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-full border border-line bg-surface" />
        <div className="h-12 w-12 animate-pulse rounded-full border border-line bg-surface" />
        <div className="h-12 w-12 animate-pulse rounded-full bg-ink/[0.06]" />
        <div className="h-12 w-12 animate-pulse rounded-full bg-ink/[0.06]" />
      </div>
    </div>
  );
}
