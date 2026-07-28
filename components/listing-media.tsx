"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { canOptimizeImage } from "@/lib/image";
import {
  isGeneratedListingFallbackUrl,
  listingFallbackTheme,
  listingMediaPresentationUrl,
} from "@/lib/listing-media";

export function ListingMedia({
  sourceUrl,
  altText,
  prizeName,
  sponsorName,
  category,
  attribution,
  priority = false,
  sizes,
  className,
  imageClassName,
}: {
  sourceUrl?: string;
  altText?: string;
  prizeName: string;
  sponsorName?: string;
  category?: string;
  attribution?: string;
  priority?: boolean;
  sizes: string;
  className?: string;
  imageClassName?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const presentationSource = listingMediaPresentationUrl(sourceUrl);
  const generatedFallback =
    isGeneratedListingFallbackUrl(presentationSource);
  const usableSource =
    presentationSource && failedUrl !== presentationSource
      ? presentationSource
      : null;
  const theme = listingFallbackTheme(category);

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      {usableSource ? (
        <>
          <Image
            src={usableSource}
            alt={altText ?? prizeName}
            fill
            priority={priority}
            className={cn(
              generatedFallback
                ? "bg-surface-2 object-contain"
                : "object-cover",
              imageClassName,
            )}
            sizes={sizes}
            unoptimized={!canOptimizeImage(usableSource)}
            onError={() => setFailedUrl(usableSource)}
          />
          {attribution ? (
            <span className="absolute bottom-2 right-2 max-w-[72%] truncate rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              Image: {attribution}
            </span>
          ) : null}
        </>
      ) : (
        <div
          role="img"
          aria-label={`Category illustration for ${prizeName}${sponsorName ? ` from ${sponsorName}` : ""}`}
          className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-surface-2 p-5 text-ink sm:p-6"
        >
          <span
            aria-hidden
            className="absolute -right-14 -top-16 h-48 w-48 rounded-[2.5rem] border-[18px] border-ocean/10"
          />
          <span
            aria-hidden
            className="absolute -bottom-12 right-8 h-36 w-36 rounded-[2.25rem] bg-pine/10"
          />

          <div className="relative flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-graphite">
              Sweepza
            </span>
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-graphite">
              Category illustration
            </span>
          </div>

          <div className="relative min-w-0 max-w-full pr-2">
            <p className="max-w-full break-words text-[10px] font-bold uppercase leading-relaxed tracking-[0.12em] text-graphite sm:tracking-[0.16em]">
              {theme.eyebrow}
            </p>
            <p className="mt-1.5 line-clamp-2 max-w-full break-words text-lg font-bold leading-tight tracking-tight sm:text-2xl">
              {prizeName}
            </p>
            {sponsorName ? (
              <p className="mt-2 line-clamp-1 max-w-full break-words text-xs font-medium text-graphite">
                Sponsor: {sponsorName}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
