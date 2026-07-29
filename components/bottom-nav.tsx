"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/cn";
import { CONSUMER_NAV_ITEMS, isNavItemActive } from "@/lib/nav";

// Mobile primary navigation (<lg). Desktop uses components/side-rail.tsx —
// both render lib/nav.ts so the IA cannot drift between breakpoints.
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] mx-auto flex w-full items-stretch border-t border-gold/30 bg-paper/95 px-1 pt-1.5 shadow-e3 backdrop-blur-xl pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:max-w-2xl sm:rounded-t-sheet sm:border-x md:max-w-3xl lg:hidden"
    >
      {CONSUMER_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pb-1.5 pt-2 text-[10px] font-bold transition",
              active
                ? "bg-ember text-on-accent shadow-e1"
                : "text-graphite hover:bg-surface-2 hover:text-ink",
            )}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-3 top-1 h-0.5 rounded-pill bg-gold"
              />
            ) : null}
            <Icon
              name={item.icon}
              size={22}
              weight={active ? "fill" : "regular"}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
