// Detail-route transition fallback shaped like the real record — hero photo,
// title, mobile action card, prose — so navigation from a card feels like the
// page is materializing rather than being replaced. (The root loading.tsx
// shows a feed silhouette, which is the wrong shape here.)
export default function ListingDetailLoading() {
  return (
    <section
      className="px-4 pb-28 pt-5 lg:mx-auto lg:max-w-5xl lg:px-8 lg:pb-12"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-4 h-4 w-24 animate-pulse rounded bg-ink/[0.06]" />

      <div className="lg:grid lg:grid-cols-[1.7fr_1fr] lg:items-start lg:gap-10">
        <div className="min-w-0">
          {/* Hero */}
          <div className="aspect-[16/10] w-full animate-pulse rounded-card bg-line" />

          {/* Title + attribution */}
          <div className="mt-5">
            <div className="h-9 w-4/5 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-2.5 h-9 w-3/5 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-3 h-4 w-2/5 animate-pulse rounded bg-ink/[0.06]" />
          </div>

          {/* Mobile action card */}
          <div className="mt-5 rounded-card border border-line bg-surface p-5 shadow-e1 lg:hidden">
            <div className="h-8 w-28 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-2 h-3 w-36 animate-pulse rounded bg-ink/[0.06]" />
            <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-ink/[0.08]" />
            <div className="mt-3 flex gap-2">
              <div className="h-11 flex-1 animate-pulse rounded-xl bg-ink/[0.06]" />
              <div className="h-11 flex-1 animate-pulse rounded-xl bg-ink/[0.06]" />
            </div>
          </div>

          {/* Prose */}
          <div className="mt-8 flex flex-col gap-2.5">
            <div className="h-6 w-44 animate-pulse rounded bg-ink/[0.08]" />
            <div className="h-3.5 w-full animate-pulse rounded bg-ink/[0.06]" />
            <div className="h-3.5 w-11/12 animate-pulse rounded bg-ink/[0.06]" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-ink/[0.06]" />
          </div>
        </div>

        {/* Desktop sticky action rail */}
        <aside className="hidden lg:block">
          <div className="rounded-card border border-line bg-surface p-6 shadow-e2">
            <div className="h-9 w-32 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-3 h-4 w-40 animate-pulse rounded bg-ink/[0.06]" />
            <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-ink/[0.08]" />
            <div className="mt-3 flex gap-2">
              <div className="h-11 flex-1 animate-pulse rounded-xl bg-ink/[0.06]" />
              <div className="h-11 flex-1 animate-pulse rounded-xl bg-ink/[0.06]" />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
