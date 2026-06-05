export const metadata = {
  title: "About",
  description:
    "Learn what Sweepza is, what it does, and how it approaches sweepstakes discovery.",
};

export default function AboutPage() {
  return (
    <section className="px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            About Sweepza
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">
            Sweepstakes, simplified.
          </h1>
          <p className="text-sm leading-relaxed text-ink/70">
            Sweepza is building a cleaner, faster way to discover legitimate
            sweepstakes worth entering. The product is mobile-first, photo-first,
            and designed to keep seekers focused on real opportunities instead of
            noisy lists.
          </p>
        </header>

        <div className="grid gap-4">
          <section className="rounded-card border border-sand bg-white/70 p-4">
            <h2 className="text-lg font-semibold text-ink">What Sweepza does</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">
              Sweepza helps people browse active sweepstakes, compare them quickly,
              and tap through to the official entry experience. It does not replace
              the sponsor’s rules or entry flow.
            </p>
          </section>

          <section className="rounded-card border border-sand bg-white/70 p-4">
            <h2 className="text-lg font-semibold text-ink">What matters here</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">
              The product direction centers on trustworthy listings, clear source
              attribution, fast mobile browsing, and a simple operating model that
              can grow into host tools, moderation, analytics, and richer search.
            </p>
          </section>

          <section className="rounded-card border border-sand bg-white/70 p-4">
            <h2 className="text-lg font-semibold text-ink">Current status</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">
              Today, Sweepza is strongest as a discovery MVP. Some features are
              still evolving, including account flows, persistence, host tools,
              observability, and automation.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
