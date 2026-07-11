// Loading placeholder matching the Sweepza ListingCard silhouette so route
// transitions keep the page structure stable: photo, title/prize, meta line,
// begins/ends row, action row.
export function ListingSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-e1">
      <div className="aspect-[16/11] w-full animate-pulse bg-line" />
      <div className="flex flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="h-5 w-3/5 animate-pulse rounded bg-ink/[0.06]" />
          <div className="h-5 w-10 shrink-0 animate-pulse rounded bg-ink/[0.06]" />
        </div>
        <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-ink/[0.06]" />
        <div className="mt-1.5 h-3 w-2/5 animate-pulse rounded bg-ink/[0.06]" />

        <div className="mt-3.5 flex items-end justify-between border-t border-line pt-3">
          <div className="h-3 w-14 animate-pulse rounded bg-ink/[0.06]" />
          <div className="h-3 w-14 animate-pulse rounded bg-ink/[0.06]" />
        </div>

        <div className="mt-3.5 flex items-stretch gap-2">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-ink/[0.06]" />
          <div className="h-10 w-11 animate-pulse rounded-xl bg-ink/[0.06]" />
        </div>
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
