import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { WinnerReportButton } from "@/components/winner-report-button";
import { WinnerReactionBar } from "@/components/winner-reaction-bar";
import { canOptimizeImage } from "@/lib/image";
import { formatEndDate, formatPrizeValue } from "@/lib/listing-format";
import type { WinnerPost } from "@/lib/types/winner";
import type { Listing } from "@/lib/types/listing";

export function WinnerCard({
  post,
  listing,
  isAuthenticated = false,
  clerkConfigured = false,
}: {
  post: WinnerPost;
  listing?: Listing;
  isAuthenticated?: boolean;
  clerkConfigured?: boolean;
}) {
  const imageUrl =
    post.photoUrl ?? listing?.mainImageUrl ?? listing?.categoryFallbackImageUrl;
  const altText =
    listing?.imageAltText ??
    `Photo shared by ${post.winnerDisplayName} with their winner story`;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-e1 transition duration-200 hover:shadow-e2">
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

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ember/15 text-sm font-semibold text-ember">
              {post.winnerDisplayName.charAt(0)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-ink">
                {post.winnerDisplayName}
              </p>
              <p className="text-xs text-graphite">
                Member-reported · Shared {formatEndDate(post.createdAt)}
              </p>
            </div>
          </div>
          <span
            className={
              post.verifiedWin
                ? "inline-flex min-h-8 items-center gap-1 rounded-pill bg-gold/10 px-2.5 text-xs font-semibold text-gold"
                : "inline-flex min-h-8 items-center gap-1 rounded-pill bg-ink/5 px-2.5 text-xs font-semibold text-graphite"
            }
          >
            <Icon
              name={post.verifiedWin ? "verified" : "info"}
              size={13}
              weight={post.verifiedWin ? "fill" : "regular"}
            />
            {post.verifiedWin ? "Evidence reviewed" : "Member story"}
          </span>
        </div>

        <p className="text-[15px] leading-relaxed text-ink/85 sm:text-base">
          {post.caption}
        </p>

        {listing || post.listingTitle ? (
          <Link
            href={`/sweeps/${listing?.slug ?? post.listingSlug}`}
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
                {listing?.title ?? post.listingTitle}
              </span>
              {listing ? (
                <span className="block text-xs text-graphite">
                  {listing.prizeName}
                  {listing.prizeValue
                    ? ` · ${formatPrizeValue(listing.prizeValue, listing.prizeCurrency)}`
                    : ""}
                </span>
              ) : post.listingPrizeValue ? (
                <span className="block text-xs text-graphite">
                  {formatPrizeValue(post.listingPrizeValue, "USD")}
                </span>
              ) : null}
            </span>
            <Icon name="caretRight" size={16} className="flex-none text-ink/40" />
          </Link>
        ) : null}

        <div className="mt-auto">
          <WinnerReactionBar
            winnerPostId={post.id}
            initialCounts={post.reactions ?? {}}
            isAuthenticated={isAuthenticated}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <p className="max-w-[34ch] text-[11px] leading-relaxed text-graphite">
              {post.verifiedWin
                ? "Sweepza reviewed supporting evidence before publication."
                : "Publication review does not independently verify this member-reported win."}
            </p>
            {post.reviewStatus === "published" ? (
              <WinnerReportButton
                winnerPostId={post.id}
                clerkConfigured={clerkConfigured}
                isSignedIn={isAuthenticated}
              />
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
