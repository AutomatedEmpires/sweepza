import { ListingSkeletonList } from "@/components/listing-skeleton";

export default function DiscoverLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="discover-loading-label"
      className="px-4 pb-8 pt-8 lg:mx-auto lg:max-w-7xl lg:px-8"
    >
      <p id="discover-loading-label" className="sr-only">
        Loading sweepstakes and discovery controls.
      </p>
      <div aria-hidden="true">
        <div className="mb-5 flex items-start justify-between gap-4 px-1">
          <div className="min-w-0 flex-1">
            <div className="h-7 w-36 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-ink/[0.06]" />
          </div>
          <div className="h-11 w-28 shrink-0 animate-pulse rounded-pill bg-line" />
        </div>

        <div className="mb-5 h-12 w-full animate-pulse rounded-xl border border-line bg-surface" />
        <div className="mb-5 flex gap-2 overflow-hidden">
          {[24, 20, 28, 24].map((width, index) => (
            <div
              key={index}
              className="h-10 shrink-0 animate-pulse rounded-pill bg-line"
              style={{ width: `${width * 4}px` }}
            />
          ))}
        </div>

        <ListingSkeletonList count={3} />

        <div className="mt-10">
          <div className="mb-3 h-5 w-52 animate-pulse rounded bg-ink/[0.06]" />
          <div className="flex flex-wrap gap-2">
            {[24, 20, 28, 24, 20].map((width, index) => (
              <div
                key={index}
                className="h-11 animate-pulse rounded-pill border border-line bg-surface"
                style={{ width: `${width * 4}px` }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
