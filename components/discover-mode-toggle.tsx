"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/cn";

// Segmented Feed | Swipe control — discovery is one system with two modes,
// not two destinations. Preserves active discovery params across modes.
const MODES: { href: string; label: string; icon: IconName }[] = [
  { href: "/discover", label: "Feed", icon: "discover" },
  { href: "/discover/swipe", label: "Swipe", icon: "repeat" },
];

export function DiscoverModeToggle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serializedParams = searchParams.toString();
  const suffix = serializedParams ? `?${serializedParams}` : "";

  return (
    <div
      role="group"
      aria-label="Discovery mode"
      className="flex shrink-0 items-center rounded-full border border-sand bg-white p-0.5"
    >
      {MODES.map((mode) => {
        const active = pathname === mode.href;
        return (
          <Link
            key={mode.href}
            href={`${mode.href}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition",
              active ? "bg-ink text-cream" : "text-ink/60 hover:text-ink",
            )}
          >
            <Icon name={mode.icon} size={14} />
            {mode.label}
          </Link>
        );
      })}
    </div>
  );
}
