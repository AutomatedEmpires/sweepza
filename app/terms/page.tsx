export const metadata = {
  title: "Terms",
  description: "Sweepza terms overview and current service-use summary.",
};

export default function TermsPage() {
  return (
    <section className="px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Terms
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">
            Terms overview
          </h1>
          <p className="text-sm leading-relaxed text-ink/70">
            This page is a product-facing placeholder summary of how Sweepza is
            intended to be used. It should be replaced with reviewed legal terms
            before a broad public launch.
          </p>
        </header>

        <section className="rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-lg font-semibold text-ink">Service role</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Sweepza helps users discover sweepstakes and then routes them to the
            official sponsor or host destination to enter. The sponsor’s official
            rules remain the governing source for each promotion.
          </p>
        </section>

        <section className="rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-lg font-semibold text-ink">User expectations</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Users should review each listing carefully, verify eligibility, and
            follow the official rules before entering. Sweepza may remove or hide
            content when quality, moderation, or trust standards require it.
          </p>
        </section>

        <section className="rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-lg font-semibold text-ink">Current note</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            These terms are a temporary overview. Replace them with finalized,
            reviewed legal terms before any production launch that accepts broad
            public traffic or paid host activity.
          </p>
        </section>
      </div>
    </section>
  );
}
