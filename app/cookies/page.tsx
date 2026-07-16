import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie & Storage Policy",
  description:
    "How Sweepza uses browser storage — essential sign-in and device state, privacy-friendly first-party analytics, no advertising cookies, and we never sell your data.",
  alternates: { canonical: "/cookies" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-e1">
      <h2 className="font-display text-lg leading-snug text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-graphite">
        {children}
      </div>
    </section>
  );
}

export default function CookiesPage() {
  return (
    <section className="px-4 pb-10 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <header className="px-1">
        <h1 className="font-display text-3xl text-ink lg:text-4xl">
          Cookie &amp; storage policy
        </h1>
        <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-graphite">
          The short version: Sweepza uses only the browser storage it needs to
          work and to understand what&apos;s useful. No advertising cookies, no
          cross-site tracking, and we never sell your data.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        <Section title="Essential storage">
          <p>
            When you sign in, your session is kept by our authentication provider
            so you stay logged in. Even without an account, your sweep activity —
            what you saved, entered, and can enter again — is stored locally on
            your device so tracking works. This storage is required for the
            product to function.
          </p>
        </Section>

        <Section title="Analytics (cookieless)">
          <p>
            We use privacy-friendly, first-party product analytics to see which
            features help and where people get stuck. It&apos;s stored in your
            browser&apos;s local storage — <strong>not cookies</strong> — is not
            shared with advertisers, and honors your browser&apos;s
            &ldquo;Do Not Track&rdquo; setting.
          </p>
        </Section>

        <Section title="What we don't do">
          <p>
            No third-party advertising or retargeting cookies. No selling or
            renting your data. No cross-site tracking of what you do elsewhere.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can clear site data or block storage anytime in your browser
            settings, and enable &ldquo;Do Not Track&rdquo; to opt out of
            analytics. Blocking essential storage may sign you out or reset your
            on-device activity.
          </p>
        </Section>
      </div>

      <p className="mt-6 px-1 text-sm text-graphite">
        For how we handle your information overall, see our{" "}
        <Link href="/privacy" className="font-semibold text-ember hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <p className="mt-6 text-center text-[10px] uppercase tracking-[0.15em] text-graphite">
        No advertising cookies · We never sell your data
      </p>
    </section>
  );
}
