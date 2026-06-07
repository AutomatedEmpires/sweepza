import Link from "next/link";

import { Icon } from "@/components/icon";
import { type ReactionType } from "@/lib/db/enums";
import { WinnerReactionBar } from "@/components/winner-reaction-bar";
import { formatEndDate, formatPrizeValue } from "@/lib/listing-format";
import type { WinnerPost } from "@/lib/mock/winners";
import type { Listing } from "@/lib/types/listing";

export function WinnerCard({
  post,
  listing,
}: {
  post: WinnerPost;
  listing?: Listing;
}) {
  const imageUrl =
    post.photoUrl ?? listing?.mainImageUrl ?? listing?.categoryFallbackImageUrl;
  const altText =
    listing?.imageAltText ?? `${post.winnerDisplayName}'s winning prize photo`;

  return (
    <article className="overflow-hidden rounded-card border border-sand bg-white">
      {imageUrl ? (
        <div className="relative aspect-[4/3] w-full bg-sand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={altText}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {post.verifiedWin ? (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-moss px-2.5 py-1 text-xs font-medium text-cream">
              <Icon name="verified" size={14} />
              Verified win
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ember/15 text-sm font-semibold text-ember">
              {post.winnerDisplayName.charAt(0)}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink">{post.winnerDisplayName}</p>
              <p className="text-xs text-ink/50">Won · {formatEndDate(post.createdAt)}</p>
            </div>
          </div>
          <Icon name="trophy" size={20} />
        </div>

        <p className="text-sm leading-relaxed text-ink/80">{post.caption}</p>

        {listing ? (
          <Link
            href={`/sweeps/${listing.slug}`}
            className="flex items-center gap-3 rounded-2xl border border-sand bg-cream p-2.5 transition hover:border-ember/40 focus-visible:border-ember focus-visible:outline-none"
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                aria-hidden
                className="h-12 w-12 flex-none rounded-xl object-cover"
                loading="lazy"
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-ink/40">
                Won from
              </span>
              <span className="line-clamp-1 text-sm font-medium text-ink">{listing.title}</span>
              <span className="block text-xs text-ink/60">
                {listing.prizeName}
                {listing.prizeValue
                  ? ` · ${formatPrizeValue(listing.prizeValue, listing.prizeCurrency)}`
                  : ""}
              </span>
            </span>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4 flex-none text-ink/40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
        ) : null}

        <WinnerReactionBar winnerPostId={post.id} reactions={post.reactions} />
      </div>
    </article>
  );
}
