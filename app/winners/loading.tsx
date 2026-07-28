export default function WinnersLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="winners-loading-label"
      className="px-4 pb-8 pt-8 lg:mx-auto lg:max-w-5xl lg:px-8"
    >
      <p id="winners-loading-label" className="sr-only">
        Loading published winner stories.
      </p>
      <div aria-hidden="true">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="h-7 w-40 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-ink/[0.06]" />
            <div className="mt-1.5 h-3 w-64 max-w-full animate-pulse rounded bg-ink/[0.06]" />
          </div>
          <div className="h-11 w-32 shrink-0 animate-pulse rounded-xl bg-line" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <article
              key={index}
              className="overflow-hidden rounded-card border border-line bg-surface shadow-e1"
            >
              <div className="aspect-[16/9] w-full animate-pulse bg-line" />
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-ink/[0.06]" />
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-32 animate-pulse rounded bg-ink/[0.08]" />
                    <div className="mt-2 h-3 w-24 animate-pulse rounded bg-ink/[0.06]" />
                  </div>
                </div>
                <div className="mt-4 h-4 w-4/5 animate-pulse rounded bg-ink/[0.08]" />
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-ink/[0.06]" />
                <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-ink/[0.06]" />
                <div className="mt-4 flex gap-2">
                  <div className="h-9 w-20 animate-pulse rounded-pill bg-line" />
                  <div className="h-9 w-20 animate-pulse rounded-pill bg-line" />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
