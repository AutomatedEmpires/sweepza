"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { canOptimizeImage } from "@/lib/image";
import { listingFallbackTheme } from "@/lib/listing-media";

/**
 * An honest source credit for an externally-referenced preview image. We render
 * the operator's own image (og:image / host-supplied URL) without copying or
 * hosting the bytes, so we say where it comes from rather than implying it is
 * ours. Only shown for `external_reference` images with a resolvable host; the
 * app's own relative category-fallback URL (and rights-cleared stored assets,
 * which carry an explicit `attribution`) never trigger it.
 */
function sourceCredit(
  url: string | null,
  sourceType: string | undefined,
): string | null {
  if (!url || sourceType !== "external_reference") return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function ListingMedia({
  sourceUrl,
  sourceType,
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
  sourceType?: string;
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
  const credit = sourceCredit(usableSource, sourceType);
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
          ) : credit ? (
            <span className="absolute bottom-2 right-2 max-w-[72%] truncate rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              via {credit}
            </span>
          ) : null}
        </>
      ) : (
        <div
          role="img"
          aria-label={`Sweepza fallback artwork for ${prizeName}${sponsorName ? ` from ${sponsorName}` : ""}`}
          className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-surface-2 via-surface to-paper p-5 text-ink sm:p-6"
        >
          <span
            aria-hidden
            className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-gold/40"
          />
          <span
            aria-hidden
            className="absolute -bottom-14 right-10 h-40 w-40 rounded-full bg-ember/10"
          />

          <div className="relative flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-graphite">
              Sweepza
            </span>
            <span className="rounded-full border border-gold/60 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold">
              Sweepza fallback
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
