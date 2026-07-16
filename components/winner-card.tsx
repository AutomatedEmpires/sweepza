import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { WinnerReactionBar } from "@/components/winner-reaction-bar";
import { canOptimizeImage } from "@/lib/image";
import { formatEndDate, formatPrizeValue } from "@/lib/listing-format";
import type { WinnerPost } from "@/lib/types/winner";
import type { Listing } from "@/lib/types/listing";

export function WinnerCard({
  post,
  listing,
  isAuthenticated = false,
}: {
  post: WinnerPost;
  listing?: Listing;
  isAuthenticated?: boolean;
}) {
  const imageUrl =
    post.photoUrl ?? listing?.mainImageUrl ?? listing?.categoryFallbackImageUrl;
  const altText =
    listing?.imageAltText ?? `${post.winnerDisplayName}'s winning prize photo`;

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface shadow-e1 transition duration-200 hover:shadow-e2">
      {imageUrl ? (
        <div className="relative aspect-[4/3] w-full bg-line">
          <Image
            src={imageUrl}
            alt={altText}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 480px, 100vw"
            unoptimized={!canOptimizeImage(imageUrl)}
          />
          {post.verifiedWin ? (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-pill bg-gold px-2.5 py-1 text-xs font-semibold text-on-won shadow-e1">
              <Icon name="verified" size={14} weight="fill" />
              Verified win
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ember/15 text-sm font-semibold text-ember">
              {post.winnerDisplayName.charAt(0)}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink">
                {post.winnerDisplayName}
              </p>
              <p className="text-xs text-graphite">
                Won · {formatEndDate(post.createdAt)}
              </p>
            </div>
          </div>
          <Icon name="trophy" size={20} weight="fill" className="text-gold" />
        </div>

        <p className="text-[15px] leading-relaxed text-ink/85">
          {post.caption}
        </p>

        {listing ? (
          <Link
            href={`/sweeps/${listing.slug}`}
            className="flex items-center gap-3 rounded-xl border border-line bg-paper p-2.5 transition hover:border-ember/40 focus-visible:border-ember focus-visible:outline-none"
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                aria-hidden
                width={48}
                height={48}
                className="h-12 w-12 flex-none rounded-lg object-cover"
                unoptimized={!canOptimizeImage(imageUrl)}
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-graphite">
                Won from
              </span>
              <span className="line-clamp-1 text-sm font-medium text-ink">
                {listing.title}
              </span>
              <span className="block text-xs text-graphite">
                {listing.prizeName}
                {listing.prizeValue
                  ? ` · ${formatPrizeValue(listing.prizeValue, listing.prizeCurrency)}`
                  : ""}
              </span>
            </span>
            <Icon name="caretRight" size={16} className="flex-none text-ink/40" />
          </Link>
        ) : null}

        <WinnerReactionBar
          winnerPostId={post.id}
          initialCounts={post.reactions ?? {}}
          isAuthenticated={isAuthenticated}
        />
      </div>
    </article>
  );
}
