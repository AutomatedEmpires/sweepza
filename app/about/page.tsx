import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "What Sweepza is and how it works — a free, mobile-first way to discover sweepstakes, enter on the host's own site, and keep every entry tracked in one place.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: `About ${APP_NAME}`,
    description: APP_TAGLINE,
    url: "/about",
    type: "website",
    siteName: APP_NAME,
  },
};

// Public trust surface — keep every claim inside what the platform actually
// enforces (see lib/trust-copy.ts for the claim-to-mechanism map): no
// universal rules/verification claims, no timing promises, entries always
// happen off-platform, review precedes publication, seekers never pay.
const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "What Sweepza does",
    body: "Sweepza is a directory and tracker for free-to-enter sweepstakes. Browse what's live, compare prizes quickly, and tap through to enter on the host's own site — entries never happen on Sweepza. Save the ones you care about and your list, entries, and wins stay in My Sweeps, even after a sweepstake ends.",
  },
  {
    heading: "Built for the daily routine",
    body: "Many sweepstakes allow one entry per day. Sweepza remembers when each entry window re-opens, keeps your streak, and can remind you — so re-entering takes seconds instead of a search through old tabs and emails.",
  },
  {
    heading: "How listings get here",
    body: "Hosts submit their own sweepstakes, and the Sweepza team adds ones it finds. Either way, a listing is reviewed before it goes live, and anyone can report a listing that looks wrong — we review reports and fix or remove what's ended or changed.",
  },
  {
    heading: "What Sweepza never does",
    body: "Sweepza never charges seekers, never requires a purchase to enter anything it lists, and never sells your entry data. We are not the sponsor: winners are chosen by each sponsor under their official rules, and a listing is information about a promotion, not a promise about its outcome.",
  },
  {
    heading: "Where it's headed",
    body: "The core loop — discover, enter, re-enter, track, win — keeps getting sharper, alongside richer discovery, better reminders, and more tools for the hosts who fund the platform so seekers never pay.",
  },
];

export default function AboutPage() {
  return (
    <section className="px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            About {APP_NAME}
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">
            Sweepstakes, simplified.
          </h1>
          <p className="text-sm leading-relaxed text-ink/70">
            {APP_NAME} remembers your sweepstakes so you don&apos;t have to —
            one mobile-first place to discover what&apos;s worth entering,
            enter on the host&apos;s own site, and keep every entry, streak,
            and win tracked.
          </p>
        </header>

        <div className="grid gap-4">
          {SECTIONS.map((section) => (
            <section
              key={section.heading}
              className="rounded-card border border-line bg-surface p-4"
            >
              <h2 className="text-lg font-semibold text-ink">
                {section.heading}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <p className="text-sm leading-relaxed text-ink/70">
          Questions the page didn&apos;t answer live in the{" "}
          <Link href="/faq" className="font-semibold text-ember underline">
            FAQ
          </Link>
          , and the fine print lives in the{" "}
          <Link href="/terms" className="font-semibold text-ember underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-ember underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
