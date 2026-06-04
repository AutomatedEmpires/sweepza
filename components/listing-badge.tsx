import { cn } from "@/lib/cn";
import type { BadgeTone, ComputedBadge } from "@/lib/listing-badges";

const TONE_STYLES: Record<BadgeTone, string> = {
  urgent: "bg-ember text-cream",
  trust: "bg-sky/15 text-sky",
  entry: "bg-ink/5 text-ink/70",
  promo: "bg-moss/15 text-moss",
  proof: "bg-moss text-cream",
  fresh: "bg-ink text-cream",
};

export function ListingBadge({
  badge,
  className,
}: {
  badge: ComputedBadge;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none shadow-sm",
        TONE_STYLES[badge.tone],
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
