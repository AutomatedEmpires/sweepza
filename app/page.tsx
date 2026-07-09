import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { TodayDashboard } from "@/components/today-dashboard";
import { ensureCurrentAppUser } from "@/lib/auth";
import { getPublicListings } from "@/lib/db/listings";
import { daysUntil, isExpired } from "@/lib/listing-badges";
import type { Listing } from "@/lib/types/listing";

export const dynamic = "force-dynamic";

// Today — the app's front door.
// Signed in: the personal daily routine (next best action + sections).
// Signed out: an editorial scene that demonstrates the product thesis —
// "Sweepza remembers your sweepstakes so you don't have to." No fake counts;
// when inventory is empty it reads as early, not broken.

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Rail({ listings }: { listings: Listing[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
      {listings.map((listing) => (
        <div
          key={listing.id}
          className="w-[86%] shrink-0 snap-center sm:w-[340px] lg:w-auto"
        >
          <ListingCard listing={listing} />
        </div>
      ))}
    </div>
  );
}

function RailSection({
  title,
  href,
  listings,
}: {
  title: string;
  href: string;
  listings: Listing[];
}) {
  if (listings.length === 0) return null;
  return (
    <section className="px-4 lg:px-0">
      <div className="mb-3.5 flex items-end justify-between">
        <h2 className="font-display text-[28px] leading-none text-ink">{title}</h2>
        <Link
          href={href}
          className="text-sm font-semibold text-ember transition hover:underline"
        >
          See all
        </Link>
      </div>
      <Rail listings={listings} />
    </section>
  );
}

function TrustBand() {
  const items: { icon: IconName; label: string }[] = [
    { icon: "shield", label: "Free to enter — always" },
    { icon: "rules", label: "Official rules on every listing" },
    { icon: "verified", label: "Verified hosts, honest sources" },
  ];
  return (
    <div className="mx-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-surface p-4 shadow-e1 sm:grid-cols-3 lg:mx-0">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pine/10 text-pine">
            <Icon name={it.icon} size={16} />
          </span>
          <span className="text-[13px] font-medium text-ink/80">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function FooterBlock() {
  return (
    <div className="flex flex-col gap-2 px-5 pb-2 lg:px-0">
      <p className="text-center text-[10px] uppercase tracking-[0.18em] text-graphite lg:text-left">
        No purchase necessary · See official rules
      </p>
      <nav
        aria-label="Footer"
        className="flex items-center justify-center gap-4 text-xs font-medium text-graphite lg:justify-start"
      >
        <Link href="/about" className="transition hover:text-ink">About</Link>
        <Link href="/privacy" className="transition hover:text-ink">Privacy</Link>
        <Link href="/terms" className="transition hover:text-ink">Terms</Link>
      </nav>
    </div>
  );
}

export default async function TodayPage() {
  const now = new Date();
  const [authUser, listings] = await Promise.all([
    ensureCurrentAppUser(),
    getPublicListings({ limit: 100 }),
  ]);
  const active = listings.filter((l) => !isExpired(l, now));
  const endingSoon = [...active]
    .sort((a, b) => daysUntil(a.endDate, now) - daysUntil(b.endDate, now))
    .slice(0, 3);
  const featured = active.filter((l) => l.isFeatured || l.isBoosted).slice(0, 3);

  // ---- Signed-in: the routine ----
  if (authUser) {
    const firstName = authUser.displayName?.split(" ")[0];
    const dateLabel = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return (
      <div className="flex flex-col gap-9 pb-8 lg:mx-auto lg:max-w-5xl lg:px-8 lg:pt-4">
        <header className="px-5 pt-8 lg:px-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">
            {greeting(now)} · {dateLabel}
          </p>
          <h1 className="mt-1.5 font-display text-[40px] leading-[1.02] text-ink lg:text-5xl">
            Your Sweepza today{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-2.5 max-w-[52ch] text-[15px] leading-relaxed text-graphite">
            Everything you&apos;re tracking, in one glance — what&apos;s ready,
            what&apos;s ending, and what you&apos;ve already handled.
          </p>
        </header>

        <TodayDashboard listings={listings} />

        <RailSection title="Worth a look" href="/discover" listings={endingSoon} />
        {featured.length > 0 && (
          <RailSection title="Featured" href="/discover" listings={featured} />
        )}

        <FooterBlock />
      </div>
    );
  }

  // ---- Signed-out: the scene ----
  const lifecycle: { icon: IconName; label: string; note: string }[] = [
    { icon: "discover", label: "Discover", note: "prizes worth your time" },
    { icon: "bookmark", label: "Save", note: "keep the ones you want" },
    { icon: "send", label: "Enter", note: "on the host's official page" },
    { icon: "repeat", label: "Ready again", note: "daily windows re-open" },
    { icon: "trophy", label: "Won", note: "kept forever" },
  ];

  return (
    <div className="flex flex-col gap-12 pb-10 lg:mx-auto lg:max-w-5xl lg:px-8 lg:pt-6">
      {/* Hero scene */}
      <header className="px-5 pt-10 lg:px-0 lg:pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ember">
          The sweepstakes operating system
        </p>
        <h1 className="mt-3 max-w-[16ch] font-display text-[44px] font-medium leading-[1.03] tracking-tightest text-ink lg:text-[68px]">
          Sweepza remembers so you don&apos;t have to.
        </h1>
        <p className="mt-4 max-w-[54ch] text-[16px] leading-relaxed text-graphite lg:text-lg">
          Sweepstakes are scattered across brands, blogs, and daily-entry pages.
          Sweepza gathers the ones worth entering and quietly keeps track of what
          you saved, entered, can enter again, and won — so every day you open one
          screen and know exactly what to do.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            Browse sweepstakes <Icon name="send" size={16} />
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 px-6 py-3 text-sm font-semibold text-ink transition hover:bg-ink/5"
          >
            Start my routine
          </Link>
          <span className="text-xs font-medium text-graphite">
            Free for seekers · no purchase necessary
          </span>
        </div>
      </header>

      {/* Lifecycle — the memory moat, shown not told */}
      <section className="px-4 lg:px-0">
        <div className="overflow-hidden rounded-sheet border border-line bg-surface shadow-e1">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-2xl text-ink">
              One sweep, from discovery to win
            </h2>
            <p className="mt-1 text-sm text-graphite">
              Sweepza tracks the whole lifecycle for you.
            </p>
          </div>
          <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {lifecycle.map((step, i) => (
              <li
                key={step.label}
                className="flex flex-col gap-2 border-t border-line p-5 sm:border-l lg:border-t-0 lg:[&:first-child]:border-l-0"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ember/10 text-ember">
                  <Icon name={step.icon} size={19} />
                </span>
                <div>
                  <p className="flex items-baseline gap-1.5 text-sm font-semibold text-ink">
                    <span className="nums font-display text-base text-ink/30">
                      {i + 1}
                    </span>
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-graphite">
                    {step.note}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Real inventory when it exists; otherwise the page stays a scene */}
      <RailSection title="Ending soon" href="/discover" listings={endingSoon} />
      {featured.length > 0 && (
        <RailSection title="Featured" href="/discover" listings={featured} />
      )}

      <TrustBand />

      {/* Winner Wall teaser */}
      <section className="px-4 lg:px-0">
        <Link
          href="/winners"
          className="flex items-center gap-4 rounded-card border border-line bg-surface p-5 shadow-e1 transition hover:shadow-e2"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold/12 text-gold">
            <Icon name="trophy" size={22} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl text-ink">Real winners, real wins</p>
            <p className="mt-0.5 text-sm text-graphite">
              The Winner Wall is where members share the prizes they&apos;ve won here.
            </p>
          </div>
          <Icon name="caretRight" size={20} className="shrink-0 text-ink/30" />
        </Link>
      </section>

      <FooterBlock />
    </div>
  );
}
