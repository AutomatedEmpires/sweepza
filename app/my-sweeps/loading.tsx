export default function MySweepsLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="my-sweeps-loading-label"
      className="px-4 pb-8 pt-8 lg:mx-auto lg:max-w-5xl lg:px-8"
    >
      <p id="my-sweeps-loading-label" className="sr-only">
        Loading your saved, entered, and ready-again sweep activity.
      </p>
      <div aria-hidden="true">
        <div className="mb-5 px-1">
          <div className="h-7 w-40 animate-pulse rounded bg-ink/[0.08]" />
          <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-ink/[0.06]" />
        </div>

        <div className="flex gap-2 overflow-hidden border-b border-line pb-3">
          {[20, 16, 20, 24, 16].map((width, index) => (
            <div
              key={index}
              className="h-11 shrink-0 animate-pulse rounded-pill bg-line"
              style={{ width: `${width * 4}px` }}
            />
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-card border border-line bg-surface p-4 shadow-e1"
            >
              <div className="h-7 w-10 animate-pulse rounded bg-ink/[0.08]" />
              <div className="mt-2 h-3 w-20 max-w-full animate-pulse rounded bg-ink/[0.06]" />
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-hidden rounded-card border border-line bg-surface shadow-e1">
          <div className="border-b border-line p-4">
            <div className="h-4 w-36 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-ink/[0.06]" />
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-line p-4 last:border-b-0"
            >
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-line" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-3/5 animate-pulse rounded bg-ink/[0.08]" />
                <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-ink/[0.06]" />
              </div>
              <div className="h-9 w-20 animate-pulse rounded-xl bg-line" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
