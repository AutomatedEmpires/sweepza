import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { SwipeDeck } from "@/components/swipe-deck";
import { isExpired } from "@/lib/listing-badges";
import { MOCK_LISTINGS } from "@/lib/mock/listings";

export const metadata: Metadata = { title: "Swipe" };

export default function SwipePage() {
  const deck = MOCK_LISTINGS.filter((l) => !isExpired(l));
  return (
    <section className="flex flex-col pt-6">
      <header className="mb-2 flex items-start justify-between gap-3 px-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl text-ink">Swipe</h1>
          <p className="text-sm text-ink/60">
            Pass, save, or enter — one sweep at a time.
          </p>
        </div>
        <Link
          href="/discover"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sand px-3.5 py-2 text-xs font-semibold text-ink/70 transition hover:bg-ink/5"
        >
          <Icon name="gift" size={14} /> Feed
        </Link>
      </header>
      <SwipeDeck listings={deck} />
    </section>
  );
}
