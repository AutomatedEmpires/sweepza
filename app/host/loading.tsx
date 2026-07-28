export default function HostLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="host-loading-label"
      className="px-4 pb-10 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl"
    >
      <p id="host-loading-label" className="sr-only">
        Loading the host workspace and listing status.
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <header className="px-1">
          <div className="h-8 w-24 animate-pulse rounded bg-ink/[0.08]" />
          <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-ink/[0.06]" />
        </header>

        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-11 w-24 shrink-0 animate-pulse rounded-xl border border-line bg-surface"
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-card border border-line bg-surface p-4 shadow-e1"
            >
              <div className="h-7 w-12 animate-pulse rounded bg-ink/[0.08]" />
              <div className="mt-2 h-3 w-24 max-w-full animate-pulse rounded bg-ink/[0.06]" />
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-e1">
          <div className="flex items-center justify-between border-b border-line p-4">
            <div>
              <div className="h-4 w-32 animate-pulse rounded bg-ink/[0.08]" />
              <div className="mt-2 h-3 w-44 animate-pulse rounded bg-ink/[0.06]" />
            </div>
            <div className="h-10 w-28 animate-pulse rounded-xl bg-line" />
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-line p-4 last:border-b-0"
            >
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-line" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-3/5 animate-pulse rounded bg-ink/[0.08]" />
                <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-ink/[0.06]" />
              </div>
              <div className="h-7 w-20 animate-pulse rounded-pill bg-line" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
