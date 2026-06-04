export default function HomePage() {
  return (
    <section className="flex flex-col gap-6 px-5 pt-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-ember">
          Sweepza
        </p>
        <h1 className="text-3xl font-bold leading-tight text-ink">
          Sweepstakes
          <br />
          Simplified.
        </h1>
        <p className="text-sm text-ink/70">
          Discover sweepstakes worth entering — photo-first, tag-driven, no noise.
        </p>
      </header>
      <div className="rounded-card border border-sand bg-white/60 p-5 text-sm text-ink/60">
        Discover feed coming soon. This is the deployable app shell (Phase 1 / Lane A).
      </div>
    </section>
  );
}
