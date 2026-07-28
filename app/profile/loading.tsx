export default function ProfileLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="profile-loading-label"
      className="flex flex-col gap-5 px-4 pb-8 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl"
    >
      <p id="profile-loading-label" className="sr-only">
        Loading your profile and preferences.
      </p>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="h-8 w-28 animate-pulse rounded bg-ink/[0.08]" />

        <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-e1">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-line" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-40 animate-pulse rounded bg-ink/[0.08]" />
            <div className="mt-2 h-3 w-52 max-w-full animate-pulse rounded bg-ink/[0.06]" />
          </div>
        </div>

        {Array.from({ length: 3 }).map((_, sectionIndex) => (
          <div key={sectionIndex}>
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-ink/[0.06]" />
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-e1">
              {Array.from({ length: sectionIndex === 2 ? 2 : 3 }).map(
                (_, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
                  >
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-line" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-32 animate-pulse rounded bg-ink/[0.08]" />
                      <div className="mt-2 h-3 w-48 max-w-full animate-pulse rounded bg-ink/[0.06]" />
                    </div>
                    <div className="h-5 w-5 animate-pulse rounded bg-ink/[0.06]" />
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
