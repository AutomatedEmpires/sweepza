"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { canOptimizeImage } from "@/lib/image";
import {
  isGeneratedListingFallbackUrl,
  listingFallbackAltText,
  listingFallbackAssetUrl,
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
  representativeLabelPosition = "top",
  attributionPosition = "bottom-right",
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
  representativeLabelPosition?: "top" | "below-prize";
  attributionPosition?: "top" | "below-prize" | "bottom-right";
}) {
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const presentationSource = listingMediaPresentationUrl(sourceUrl, category);
  const representativeSource = listingFallbackAssetUrl(category);
  const representativePhoto =
    isGeneratedListingFallbackUrl(presentationSource) ||
    !presentationSource ||
    failedUrls.has(presentationSource);
  const candidateSource = representativePhoto
    ? representativeSource
    : presentationSource;
  const usableSource =
    candidateSource && !failedUrls.has(candidateSource)
      ? candidateSource
      : null;
  const theme = listingFallbackTheme(category);
  const representativeAltText = listingFallbackAltText(category);

  function handleImageError(url: string) {
    setFailedUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }

  return (
    <div
      className={cn("overflow-hidden", className)}
      style={{ position: "absolute", inset: 0 }}
    >
      {usableSource ? (
        <>
          <Image
            src={usableSource}
            alt={
              representativePhoto
                ? representativeAltText
                : altText ?? prizeName
            }
            fill
            priority={priority}
            className={cn("bg-surface-2 object-cover", imageClassName)}
            sizes={sizes}
            unoptimized={!canOptimizeImage(usableSource)}
            onError={() => handleImageError(usableSource)}
          />
          {representativePhoto ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-2 z-10 max-w-[calc(100%-1rem)] rounded-md bg-black/70 px-2 py-1 text-center text-[9px] font-bold uppercase leading-tight tracking-[0.06em] text-white backdrop-blur-sm",
                representativeLabelPosition === "below-prize"
                  ? "top-[4.25rem]"
                  : "top-2",
              )}
            >
              Representative photo
            </span>
          ) : attribution ? (
            <span
              className={cn(
                "absolute z-10 truncate rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm",
                attributionPosition === "bottom-right"
                  ? "bottom-2 right-2 max-w-[72%]"
                  : attributionPosition === "below-prize"
                    ? "left-2 top-[4.25rem] max-w-[calc(100%-1rem)]"
                    : "left-2 top-2 max-w-[calc(100%-5rem)]",
              )}
            >
              Image: {attribution}
            </span>
          ) : null}
        </>
      ) : (
        <div
          role="img"
          aria-label={`Representative photo unavailable for ${theme.label.toLowerCase()} listings. ${prizeName}${sponsorName ? ` from ${sponsorName}` : ""}.`}
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
              Representative photo unavailable
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
