import { cn } from "@/lib/cn";
import { Icon } from "@/components/icon";
import type { ContextTone, ListingContext } from "@/lib/listing-context";

// One context label per card. Two visual variants:
//  - "chip": solid, sits over the cover photo (bottom-left) for feed scanning.
//  - "eyebrow": quiet uppercase label + dot, used above titles on detail/rails.
const CHIP_TONE: Record<ContextTone, string> = {
  won: "bg-gold text-on-won",
  urgent: "bg-flame text-on-urgent",
  soon: "bg-ember text-on-accent",
  again: "bg-pine text-on-trust",
  entered: "bg-ink/85 text-paper",
  new: "bg-ocean text-on-info",
  daily: "bg-surface/92 text-pine ring-1 ring-pine/20",
  featured: "bg-ink text-paper",
  category: "bg-surface/92 text-ink ring-1 ring-ink/10",
  expired: "bg-ink/60 text-paper",
};

const DOT_TONE: Record<ContextTone, string> = {
  won: "bg-gold",
  urgent: "bg-flame",
  soon: "bg-ember",
  again: "bg-pine",
  entered: "bg-ink",
  new: "bg-ocean",
  daily: "bg-pine",
  featured: "bg-ink",
  category: "bg-graphite",
  expired: "bg-graphite",
};

export function ContextTag({
  context,
  variant = "chip",
  className,
}: {
  context: ListingContext;
  variant?: "chip" | "eyebrow";
  className?: string;
}) {
  const urgent = context.tone === "urgent";

  if (variant === "eyebrow") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
          context.tone === "won"
            ? "text-gold"
            : urgent
              ? "text-flame"
              : context.tone === "soon"
                ? "text-ember"
                : context.tone === "again"
                  ? "text-pine"
                  : context.tone === "new"
                    ? "text-ocean"
                    : "text-graphite",
          className,
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            DOT_TONE[context.tone],
            urgent && "animate-pulse-urgent",
          )}
        />
        {context.label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-semibold tracking-wide shadow-e1 backdrop-blur",
        CHIP_TONE[context.tone],
        className,
      )}
    >
      {urgent && (
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-urgent" />
      )}
      {context.tone === "again" && (
        <Icon name="repeat" size={11} className="-ml-0.5" />
      )}
      {context.tone === "won" && (
        <Icon name="trophy" size={11} weight="fill" className="-ml-0.5" />
      )}
      {context.label}
    </span>
  );
}
