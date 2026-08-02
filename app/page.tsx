import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Icon, type IconName } from "@/components/icon";
import { ListingCard } from "@/components/listing-card";
import { TodayDashboard } from "@/components/today-dashboard";
import { GamificationStrip } from "@/components/gamification-strip";
import { ensureCurrentAppUser } from "@/lib/auth";
import { getCachedPublicListings } from "@/lib/db/listings-cache";
import { getSeekerHistoryListingsByIds } from "@/lib/db/listings";
import { withPublicFallback } from "@/lib/db/resilient";
import { getSeekerGamification } from "@/lib/db/gamification";
import { getSeekerStateSnapshotForAppUser } from "@/lib/db/seeker-state";
import { daysUntil, isExpired } from "@/lib/listing-badges";
import { serializeJsonLd } from "@/lib/listing-seo";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/structured-data";
import { TRUST_BAND_ITEMS } from "@/lib/trust-copy";
import type { Listing } from "@/lib/types/listing";

// The root layout supplies the title, description, and OG card for "/", but
// metadata is not inherited for `alternates`, so the highest-authority URL on
// the domain was the only public page shipping without a canonical link.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Site-level structured data — Organization + WebSite (with a SearchAction for
// the sitelinks search box). Lives on the homepage, the canonical place for it.
function SiteJsonLd() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildOrganizationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildWebSiteJsonLd()) }}
      />
    </>
  );
}

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
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 xl:grid-cols-4">
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
  // Copy lives in lib/trust-copy.ts, held to enforced reality by
  // lib/__tests__/honest-copy.test.ts — never overclaim here.
  return (
    <div className="mx-4 grid grid-cols-1 gap-3 rounded-card border border-line bg-surface p-4 shadow-e1 sm:grid-cols-3 lg:mx-0">
      {TRUST_BAND_ITEMS.map((it) => (
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
      {/* Was: "No purchase necessary · See official rules" — asserted a sponsor's
          legal representation about their own promotion. Nothing backs it:
          `no_purchase_necessary` is nullable and unchecked. Point at the rules instead. */}
      <p className="text-center text-[10px] uppercase tracking-[0.18em] text-graphite lg:text-left">
        Eligibility, odds, and entry terms are set by the official rules
      </p>
      <nav
        aria-label="Footer"
        className="flex items-center justify-center gap-4 text-xs font-medium text-graphite lg:justify-start"
      >
        <Link href="/about" className="transition hover:text-ink">About</Link>
        <Link href="/faq" className="transition hover:text-ink">FAQ</Link>
        <Link href="/privacy" className="transition hover:text-ink">Privacy</Link>
        <Link href="/cookies" className="transition hover:text-ink">Cookies</Link>
        <Link href="/terms" className="transition hover:text-ink">Terms</Link>
      </nav>
    </div>
  );
}

export default async function TodayPage() {
  const now = new Date();
  const [authUser, listings] = await Promise.all([
    ensureCurrentAppUser(),
    // The front door must never trade its designed empty state for the error
    // boundary; a feed failure renders the same page as an empty catalog.
    withPublicFallback(getCachedPublicListings(100), [], "today_feed"),
  ]);

  // The public feed is intentionally bounded, but a seeker's routine is not.
  // Hydrate touched listings that have expired, been archived, or fallen
  // outside the feed window so Today never loses saved/entered/won history.
  let routineListings = listings;
  if (authUser) {
    const snapshot = await getSeekerStateSnapshotForAppUser(authUser.appUserId);
    const known = new Set(listings.map((listing) => listing.id));
    const touched = new Set([
      ...Object.keys(snapshot.saved),
      ...Object.keys(snapshot.activity),
      ...Object.keys(snapshot.primary).filter(
        (id) => snapshot.primary[id] !== "none",
      ),
    ]);
    const missing = [...touched].filter((id) => !known.has(id));

    if (missing.length > 0) {
      const history = await getSeekerHistoryListingsByIds(missing);
      routineListings = [
        ...listings,
        ...history.filter((listing) => !known.has(listing.id)),
      ];
    }
  }

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
    const gamification = await getSeekerGamification(authUser.appUserId, now);
    return (
      <div className="flex flex-col gap-9 pb-8 lg:mx-auto lg:max-w-7xl lg:px-8 lg:pt-4">
        <SiteJsonLd />
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

        <div className="px-4 lg:px-0">
          <GamificationStrip data={gamification} />
        </div>

        <TodayDashboard listings={routineListings} />

        <RailSection title="Worth a look" href="/discover" listings={endingSoon} />
        {featured.length > 0 && (
          <RailSection title="Featured" href="/discover" listings={featured} />
        )}

        <FooterBlock />
      </div>
    );
  }

  // ---- Signed-out: product-led public site ----
  const lifecycle: { icon: IconName; label: string; note: string }[] = [
    { icon: "discover", label: "Discover", note: "Review current promotions and source details" },
    { icon: "bookmark", label: "Save", note: "Keep promising listings in one place" },
    { icon: "externalLink", label: "Enter", note: "Continue on the promotion's official site" },
    { icon: "check", label: "Track", note: "Confirm what you completed" },
    { icon: "repeat", label: "Ready again", note: "See when recurring entry windows return" },
  ];
  const heroListing = featured[0] ?? endingSoon[0] ?? active[0];
  const currentListings = active.slice(0, 4);
  const queuePreview = active.slice(0, 3);

  return (
    <div className="overflow-hidden">
      <SiteJsonLd />
      <header className="relative overflow-hidden border-b border-line bg-paper text-ink">
        <div
          aria-hidden
          className="absolute -right-28 top-16 h-72 w-72 rounded-full bg-ember/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -left-32 bottom-0 h-64 w-64 rounded-full bg-gold/15 blur-3xl"
        />
        <div className="relative mx-auto w-full max-w-[1440px] px-4 pb-9 pt-4 sm:px-6 sm:pb-12 sm:pt-6 lg:px-10 lg:pb-16 lg:pt-10">
          <div className="overflow-hidden rounded-[2rem] border border-gold/45 bg-surface shadow-e3">
            <Image
              src="/brand/sweepza-casino-hero.webp"
              alt="Sweepza slot-machine marquee in a purple and gold casino lounge, reading Sweepstakes Simplified"
              width={2400}
              height={1018}
              priority
              className="aspect-[4/3] w-full object-cover object-center sm:aspect-[16/9] lg:aspect-[1200/509]"
              sizes="(min-width: 1440px) 1360px, (min-width: 1024px) calc(100vw - 80px), calc(100vw - 32px)"
            />
          </div>

          <div className="mt-6 grid items-start gap-8 lg:mt-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-10">
            <div className="lg:sticky lg:top-24">
              <p className="inline-flex min-h-8 items-center gap-2 rounded-pill border border-gold/45 bg-gold/[0.08] px-3 text-xs font-extrabold uppercase tracking-[0.16em] text-gold">
                <Icon name="sparkle" size={14} weight="fill" />
                Sweepstakes simplified
              </p>
              <h1 className="mt-4 max-w-[12ch] font-display text-[42px] leading-[0.98] tracking-[-0.055em] text-ink sm:text-[56px] lg:text-[66px]">
                Real sweeps. One bold daily run.
              </h1>
              <p className="mt-4 max-w-[56ch] text-sm leading-6 text-graphite sm:text-base">
                Scan the prize, sponsor, eligibility, deadline, and entry
                rhythm. Then continue on the promotion&apos;s official site.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:items-center">
                <Link
                  href="/discover"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ember px-5 text-sm font-extrabold text-on-accent shadow-e2 transition hover:-translate-y-0.5 hover:shadow-e3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  Browse sweeps <Icon name="caretRight" size={17} />
                </Link>
                <Link
                  href="/sign-up"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-line bg-surface px-5 text-sm font-bold text-ink transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  Save my run
                </Link>
              </div>
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold text-graphite">
                {[
                  "Official-source link-outs",
                  "Expired sweeps hidden",
                  "No win promises",
                ].map((label) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <Icon name="check" size={14} className="text-pine" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <section
              aria-labelledby="daily-drop-heading"
              className="relative rounded-[2rem] border border-gold/35 bg-surface p-3 shadow-e3 sm:p-4"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <h2
                    id="daily-drop-heading"
                    className="text-xs font-extrabold uppercase tracking-[0.16em] text-ember"
                  >
                    Daily drop
                  </h2>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    {heroListing
                      ? "One current listing at a glance"
                      : "New listings appear after review"}
                  </p>
                </div>
                <span className="nums rounded-pill border border-pine/30 bg-pine/[0.08] px-2.5 py-1 text-[11px] font-bold text-pine">
                  {active.length} shown today
                </span>
              </div>
              {heroListing ? (
                <ListingCard
                  listing={heroListing}
                  surface="scroll"
                  tone="featured"
                />
              ) : (
                <div className="rounded-card border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
                  <Icon name="discover" size={28} className="mx-auto text-pine" />
                  <h3 className="mt-3 text-lg font-bold text-ink">
                    Fresh listings are being reviewed
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-graphite">
                    Sweepza only shows listings that meet the public catalog
                    gates. Check Discover for the latest available inventory.
                  </p>
                </div>
              )}
              <p className="px-1 pt-3 text-[11px] leading-5 text-graphite">
                Sweepza summarizes and tracks third-party promotions. The named
                sponsor or administrator controls the promotion and its
                Official Rules.
              </p>
            </section>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-16 px-5 py-16 sm:px-6 lg:px-10 lg:py-20">
        <section aria-labelledby="current-sweeps-heading">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-pine">
                Browse now
              </p>
              <h2 id="current-sweeps-heading" className="mt-2 font-display text-3xl text-ink sm:text-4xl">
                Current sweepstakes, without the clutter
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite sm:text-base">
                Scan the prize, sponsor, eligibility, entry rhythm, and deadline
                before opening the official source.
              </p>
            </div>
            <Link
              href="/discover"
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink transition hover:bg-surface-2 sm:self-auto"
            >
              View all listings <Icon name="caretRight" size={16} />
            </Link>
          </div>
          {currentListings.length > 0 ? (
            <Rail listings={currentListings} />
          ) : (
            <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
              <p className="font-bold text-ink">No public listings are available right now.</p>
              <p className="mt-2 text-sm text-graphite">
                Expired and unavailable promotions stay out of the active catalog.
              </p>
            </div>
          )}
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start"
        >
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember">
              The daily habit
            </p>
            <h2 id="how-it-works-heading" className="mt-2 font-display text-3xl text-ink sm:text-4xl">
              Remember less. Enter with more intention.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-graphite">
              Save the promotions you care about, mark entries only after you
              complete them on the official site, and let Today organize what is
              ready, recurring, or ending.
            </p>
            <Link
              href="/sign-up"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-paper transition hover:opacity-90"
            >
              Build my routine <Icon name="caretRight" size={16} />
            </Link>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {lifecycle.map((step, index) => (
              <li
                key={step.label}
                className="rounded-card border border-line bg-surface p-5 shadow-e1 last:sm:col-span-2"
              >
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ember/9 text-ember">
                    <Icon name={step.icon} size={20} />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-graphite">
                      Step {index + 1}
                    </p>
                    <h3 className="mt-1 text-base font-extrabold text-ink">{step.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-graphite">{step.note}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {queuePreview.length > 0 ? (
          <section aria-labelledby="today-preview-heading" className="rounded-sheet border border-line bg-ink p-6 text-paper sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-paper/65">
                  Today
                </p>
                <h2 id="today-preview-heading" className="mt-2 font-display text-3xl text-paper">
                  Open the app. Know what matters next.
                </h2>
                <p className="mt-3 text-sm leading-6 text-paper/70">
                  Your queue is shaped by real deadlines and the activity you
                  choose to track—never by a promise that you will win.
                </p>
              </div>
              <div className="space-y-2">
                {queuePreview.map((listing, index) => (
                  <Link
                    key={listing.id}
                    href={`/sweeps/${listing.slug}`}
                    className="flex min-h-16 items-center gap-3 rounded-xl bg-paper/10 p-3 transition hover:bg-paper/15"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper text-ink">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-paper">{listing.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-paper/65">
                        {listing.originalSponsorName ?? listing.host?.name ?? "Sponsor shown in listing"} · Review official details
                      </span>
                    </span>
                    <Icon name="caretRight" size={18} className="shrink-0 text-paper/50" />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <TrustBand />

        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/winners"
            className="group flex min-h-52 flex-col justify-between rounded-sheet border border-line bg-surface p-6 shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2 sm:p-8"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gold/10 text-gold">
              <Icon name="trophy" size={23} weight="fill" />
            </span>
            <div className="mt-8">
              <p className="font-display text-2xl text-ink">Member-reported wins</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                Visit the moderated Winner Wall. Posts are member reports, not
                proof that Sweepza operated or fulfilled a promotion.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-ink">
                See the Winner Wall
                <Icon name="caretRight" size={16} className="transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
          <Link
            href="/host"
            className="group flex min-h-52 flex-col justify-between rounded-sheet border border-pine/20 bg-pine/8 p-6 transition hover:-translate-y-0.5 hover:bg-pine/12 sm:p-8"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-pine text-on-trust">
              <Icon name="host" size={23} />
            </span>
            <div className="mt-8">
              <p className="font-display text-2xl text-ink">Run a promotion?</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-graphite">
                Submit or claim a listing, provide official rules and source
                links, and follow its review status from the host workspace.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-pine">
                Explore sponsor tools
                <Icon name="caretRight" size={16} className="transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </section>

        <section className="rounded-sheet bg-ember px-6 py-10 text-center text-on-accent sm:px-10 sm:py-14">
          <Icon name="sparkle" size={24} weight="fill" className="mx-auto" />
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl sm:text-4xl">
            Turn scattered tabs into one simple routine.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-on-accent/80 sm:text-base">
            Browse without an account. Sign up when you want your saved and
            entered activity available across sessions.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-surface px-6 text-sm font-bold text-ink shadow-e1"
            >
              Start free
            </Link>
            <Link
              href="/discover"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-on-accent/35 px-6 text-sm font-bold text-on-accent"
            >
              Browse first
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
