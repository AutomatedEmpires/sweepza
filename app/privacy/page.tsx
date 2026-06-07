export const metadata = {
  title: "Privacy",
  description: "Sweepza privacy overview and product data handling summary.",
};

export default function PrivacyPage() {
  return (
    <section className="px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Privacy
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">
            Privacy overview
          </h1>
          <p className="text-sm leading-relaxed text-ink/70">
            This page is a product-facing privacy summary for the current Sweepza
            application state. It should be replaced with finalized legal copy
            before a broad public launch.
          </p>
        </header>

        <section className="rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-lg font-semibold text-ink">Information Sweepza uses</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Sweepza currently focuses on public listing discovery data and basic
            product telemetry. Future account, billing, and winner-post features
            may introduce additional personal data flows once they are enabled.
          </p>
        </section>

        <section className="rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-lg font-semibold text-ink">How data is used</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Product data is used to render listings, improve discovery quality,
            monitor application health, and support future account features. Sweepza
            should avoid collecting unnecessary sensitive data and should keep
            analytics payloads free of private user content.
          </p>
        </section>

        <section className="rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-lg font-semibold text-ink">Current note</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            This privacy summary is intentionally lightweight and not a substitute
            for reviewed legal terms. Before launch, replace this page with the
            approved privacy policy for the Sweepza business and deployment setup.
          </p>
        </section>
      </div>
    </section>
  );
}
