export default function AdminLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="admin-loading-label"
      className="px-5 pb-10 pt-8"
    >
      <p id="admin-loading-label" className="sr-only">
        Loading operational queues and the admin platform snapshot.
      </p>
      <div aria-hidden="true">
        <div className="h-3 w-16 animate-pulse rounded bg-ember/15" />
        <div className="mt-2 h-7 w-44 animate-pulse rounded bg-ink/[0.08]" />
        <div className="mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-ink/[0.06]" />

        <div className="mt-6">
          <div className="mb-3 h-3 w-28 animate-pulse rounded bg-ink/[0.06]" />
          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-e1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 border-b border-line p-4 last:border-b-0"
              >
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-ember/10" />
                <div className="h-4 min-w-0 flex-1 animate-pulse rounded bg-ink/[0.08]" />
                <div className="h-6 w-9 animate-pulse rounded-pill bg-line" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-ink/[0.06]" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-card border border-line bg-surface p-5 shadow-e1"
              >
                <div className="h-8 w-12 animate-pulse rounded bg-ink/[0.08]" />
                <div className="mt-2 h-3 w-24 max-w-full animate-pulse rounded bg-ink/[0.06]" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 h-3 w-28 animate-pulse rounded bg-ink/[0.06]" />
          <div className="overflow-hidden rounded-card border border-line bg-surface p-2 shadow-e1">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 last:border-b-0"
              >
                <div className="h-4 w-1/2 animate-pulse rounded bg-ink/[0.08]" />
                <div className="flex items-center gap-3">
                  <div className="h-7 w-20 animate-pulse rounded-pill bg-line" />
                  <div className="h-3 w-16 animate-pulse rounded bg-ink/[0.06]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
