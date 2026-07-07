import { ListingSkeletonList } from "@/components/listing-skeleton";

// Global route-transition fallback: header shimmer + card silhouettes keep
// the shell stable while server components fetch.
export default function RootLoading() {
  return (
    <section className="px-4 pb-8 pt-8" aria-busy="true" aria-live="polite">
      <div className="mb-5 px-1">
        <div className="h-8 w-44 animate-pulse rounded bg-sand/70" />
        <div className="mt-2 h-3 w-64 animate-pulse rounded bg-sand/50" />
      </div>
      <ListingSkeletonList count={3} />
    </section>
  );
}
