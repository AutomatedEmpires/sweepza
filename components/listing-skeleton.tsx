// Loading placeholder matching the Sweepza Card silhouette so route
// transitions keep the page structure stable.
export function ListingSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-sand bg-cream shadow-sm">
      <div className="aspect-[4/3] w-full animate-pulse bg-sand" />
      <div className="relative -mt-4 rounded-t-[1.75rem] bg-cream px-4 pb-4 pt-4">
        <div className="h-5 w-4/5 animate-pulse rounded bg-sand/70" />
        <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-sand/60" />
        <div className="mt-3 h-3 w-3/5 animate-pulse rounded bg-sand/50" />
        <div className="mt-4 h-10 w-full animate-pulse rounded-full bg-sand/50" />
      </div>
    </div>
  );
}

export function ListingSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <ListingSkeleton key={index} />
      ))}
    </div>
  );
}
