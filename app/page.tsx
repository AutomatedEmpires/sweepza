import Link from "next/link";

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
      <Link
        href="/discover"
        className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-cream"
      >
        Browse sweepstakes
      </Link>
      <div className="rounded-card border border-sand bg-white/60 p-5 text-sm text-ink/60">
        The Discover feed is live with sample listings. Real data, accounts, and
        the Winner Wall arrive in the next lanes.
      </div>
    </section>
  );
}
