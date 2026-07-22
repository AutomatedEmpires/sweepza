"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { canOptimizeImage } from "@/lib/image";
import { listingFallbackTheme } from "@/lib/listing-media";

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

  const usableSource = sourceUrl && failedUrl !== sourceUrl ? sourceUrl : null;
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
            className={cn("object-cover", imageClassName)}
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
          aria-label={`Sweepza fallback artwork for ${prizeName}${sponsorName ? ` from ${sponsorName}` : ""}`}
          className="relative flex h-full w-full flex-col justify-between overflow-hidden p-5 text-white sm:p-6"
          style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
        >
          <span
            aria-hidden
            className="absolute -right-16 -top-20 h-64 w-64 rounded-full border opacity-40"
            style={{ borderColor: theme.accent }}
          />
          <span
            aria-hidden
            className="absolute -bottom-14 right-10 h-40 w-40 rounded-full opacity-10"
            style={{ backgroundColor: theme.accent }}
          />

          <div className="relative flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/85">
              Sweepza
            </span>
            <span
              className="rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em]"
              style={{ borderColor: `${theme.accent}99`, color: theme.accent }}
            >
              Sweepza fallback
            </span>
          </div>

          <div className="relative min-w-0 max-w-full pr-2">
            <p className="max-w-full break-words text-[10px] font-bold uppercase leading-relaxed tracking-[0.12em] text-white/65 sm:tracking-[0.16em]">
              {theme.eyebrow}
            </p>
            <p className="mt-1.5 line-clamp-2 max-w-full break-words text-lg font-bold leading-tight tracking-tight sm:text-2xl">
              {prizeName}
            </p>
            {sponsorName ? (
              <p className="mt-2 line-clamp-1 max-w-full break-words text-xs font-medium text-white/75">
                Sponsor: {sponsorName}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
