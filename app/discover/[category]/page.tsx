import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/listing-card";
import { Icon } from "@/components/icon";
import { CATEGORY_HUBS, getCategoryHub } from "@/lib/category-hubs";
import { getPublicListings } from "@/lib/db/listings";
import { withPublicFallback } from "@/lib/db/resilient";
import { serializeJsonLd } from "@/lib/listing-seo";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
} from "@/lib/structured-data";
import { SITE_URL } from "@/lib/site";

// Dynamic like every catalog surface — inventory changes daily, and the slug
// set is validated against the hub registry at request time (unknown → 404).
export const dynamic = "force-dynamic";

// Category hubs — crawlable landing pages over the controlled taxonomy, one
// per dictionary category. These are the programmatic-SEO front doors for
// queries like "cash sweepstakes" or "travel giveaways": unique metadata,
// server-rendered inventory, breadcrumb + ItemList structured data, and
// crawlable cross-links to sibling hubs. The chip/filter Discover experience
// (?category=) stays the interactive path; hubs are the indexable one.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const hub = getCategoryHub(category);
  // 404 from metadata so the status commits before the body streams —
  // returning a fallback title here would ship a 200 for unknown slugs.
  if (!hub) notFound();

  const canonical = new URL(`/discover/${hub.slug}`, SITE_URL);
  return {
    title: hub.title,
    description: hub.description,
    alternates: { canonical },
    openGraph: {
      title: hub.title,
      description: hub.description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function CategoryHubPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const hub = getCategoryHub(category);
  if (!hub) notFound();

  // A data-layer failure degrades to the hub's designed empty state.
  const listings = await withPublicFallback(
    getPublicListings({ categories: [hub.code], limit: 60 }),
    [],
    "category_hub",
  );

  const breadcrumbJsonLd = serializeJsonLd(
    buildBreadcrumbJsonLd([
      { name: "Discover", url: new URL("/discover", SITE_URL).toString() },
      {
        name: hub.label,
        url: new URL(`/discover/${hub.slug}`, SITE_URL).toString(),
      },
    ]),
  );
  // Always emitted — an empty ItemList is valid schema.org and keeps the
  // hub's structured-data contract stable across empty/degraded inventory.
  const itemListJsonLd = serializeJsonLd(
    buildItemListJsonLd(
      listings.map((listing) => ({
        name: listing.title,
        url: new URL(`/sweeps/${listing.slug}`, SITE_URL).toString(),
      })),
    ),
  );

  const siblings = CATEGORY_HUBS.filter((h) => h.slug !== hub.slug);

  return (
    <section className="px-4 pb-10 pt-8 lg:mx-auto lg:max-w-5xl lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />

      <nav aria-label="Breadcrumb" className="mb-4 px-1">
        <Link
          href="/discover"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-graphite transition hover:text-ink"
        >
          <Icon name="caretRight" size={15} className="rotate-180" /> Discover
        </Link>
      </nav>

      <header className="mb-6 px-1">
        {/* Was: "Free to enter · No purchase necessary" — asserted, for every listing in
            the category, a no-purchase fact only the sponsor can represent and nothing verifies. */}
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">
          Free for seekers — entry terms set by each sponsor
        </p>
        <h1 className="mt-1.5 font-display text-[32px] leading-[1.05] text-ink lg:text-[40px]">
          {hub.label} sweepstakes
        </h1>
        <p className="mt-2.5 max-w-[58ch] text-[15px] leading-relaxed text-graphite">
          {hub.description}
        </p>
      </header>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center shadow-e1">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-ember/10 text-ember">
            <Icon name="gift" size={26} />
          </span>
          <p className="font-display text-xl text-ink">
            No open {hub.label.toLowerCase()} sweepstakes right now
          </p>
          <p className="max-w-xs text-sm text-graphite">
            Inventory changes daily. Browse everything that&apos;s live, or
            check back soon.
          </p>
          <Link
            href="/discover"
            className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
          >
            Browse all sweeps
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} surface="scroll" />
          ))}
        </div>
      )}

      {/* Crawlable cross-links keep hub pages one hop apart. */}
      <nav aria-label="More categories" className="mt-10">
        <h2 className="mb-3 px-1 font-display text-xl text-ink">
          More prize categories
        </h2>
        <div className="flex flex-wrap gap-2">
          {siblings.map((s) => (
            <Link
              key={s.slug}
              href={`/discover/${s.slug}`}
              className="inline-flex min-h-11 items-center rounded-pill border border-line bg-surface px-3.5 text-sm font-semibold text-ink/70 transition hover:border-ink/25 hover:text-ink"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </nav>
    </section>
  );
}
