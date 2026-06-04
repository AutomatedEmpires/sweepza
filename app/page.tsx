import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { daysUntil, isExpired } from "@/lib/listing-badges";
import { formatPrizeValue } from "@/lib/listing-format";
import { MOCK_LISTINGS } from "@/lib/mock/listings";
import type { Listing } from "@/lib/types/listing";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "gift",
    title: "Discover",
    body: "A photo-first feed of sweepstakes worth your time — tag-driven, no noise.",
  },
  {
    icon: "send",
    title: "Enter",
    body: "Tap through to the host’s official entry page. Sweepza never charges to enter.",
  },
  {
    icon: "trophy",
    title: "Win",
    body: "Track what you entered and celebrate real wins on the Winner Wall.",
  },
];

function Rail({ listings }: { listings: Listing[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
      {listings.map((listing) => (
        <div key={listing.id} className="w-[85%] shrink-0 snap-center">
          <ListingCard listing={listing} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const now = new Date();
  const active = MOCK_LISTINGS.filter((l) => !isExpired(l, now));

  const endingSoon = [...active]
    .sort((a, b) => daysUntil(a.endDate, now) - daysUntil(b.endDate, now))
    .slice(0, 4);

  const featured = active.filter((l) => l.isFeatured || l.isBoosted);

  const endingSoonCount = active.filter((l) => {
    const d = daysUntil(l.endDate, now);
    return d >= 0 && d <= 3;
  }).length;

  const prizePool = formatPrizeValue(
    active.reduce((sum, l) => sum + (l.prizeValue ?? 0), 0),
    "USD",
  );

  return (
    <div className="flex flex-col gap-8 pb-6">
      {/* Hero */}
      <header className="px-5 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Sweepza
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] text-ink">
          Sweepstakes,
          <br />
          simplified.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/70">
          Discover sweepstakes worth entering — photo-first, tag-driven, no noise.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-full bg-moss px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-moss/90"
          >
            Browse sweepstakes <Icon name="send" size={16} />
          </Link>
          <Link
            href="/winners"
            className="inline-flex items-center gap-1.5 rounded-full border border-sand px-5 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
          >
            Winner Wall <Icon name="trophy" size={16} />
          </Link>
        </div>
      </header>

      {/* Live stat strip */}
      <div className="mx-5 grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-card border border-sand bg-cream">
        <div className="px-3 py-4 text-center">
          <p className="font-display text-2xl text-ink">{active.length}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink/45">
            Live sweeps
          </p>
        </div>
        <div className="px-3 py-4 text-center">
          <p className="font-display text-2xl text-ember">{endingSoonCount}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink/45">
            Ending soon
          </p>
        </div>
        <div className="px-3 py-4 text-center">
          <p className="font-display text-2xl text-ink">{prizePool ?? "—"}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink/45">
            In prizes
          </p>
        </div>
      </div>

      {/* Ending soon rail */}
      {endingSoon.length > 0 && (
        <section className="px-4">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-2xl text-ink">Ending soon</h2>
            <Link
              href="/discover"
              className="text-xs font-semibold text-moss transition hover:underline"
            >
              See all
            </Link>
          </div>
          <Rail listings={endingSoon} />
        </section>
      )}

      {/* Featured rail */}
      {featured.length > 0 && (
        <section className="px-4">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-2xl text-ink">Featured &amp; boosted</h2>
            <Link
              href="/discover"
              className="text-xs font-semibold text-moss transition hover:underline"
            >
              See all
            </Link>
          </div>
          <Rail listings={featured} />
        </section>
      )}

      {/* How it works */}
      <section className="px-5">
        <h2 className="mb-3 font-display text-2xl text-ink">How Sweepza works</h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex items-start gap-3 rounded-card border border-sand bg-cream p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-moss/10 text-moss">
                <Icon name={step.icon} size={20} />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="font-display text-base text-ink/40">
                    {i + 1}
                  </span>
                  {step.title}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink/65">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Winner Wall teaser */}
      <section className="px-5">
        <Link
          href="/winners"
          className="flex items-center gap-3 rounded-card border border-moss/30 bg-moss/5 p-4 transition hover:bg-moss/10"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-moss text-cream">
            <Icon name="trophy" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Real winners, real wins</p>
            <p className="mt-0.5 text-sm text-ink/65">
              See what seekers have won and share your own.
            </p>
          </div>
          <span className="ml-auto text-moss">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
      </section>

      {/* Footer microcopy */}
      <p className="px-5 text-center text-[10px] uppercase tracking-[0.15em] text-ink/40">
        No purchase necessary · See official rules
      </p>
    </div>
  );
}
