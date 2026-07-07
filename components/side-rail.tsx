"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/cn";
import { CONSUMER_NAV_ITEMS, isNavItemActive } from "@/lib/nav";

// Desktop navigation rail (≥lg). Same items as the mobile bottom nav — one
// canonical IA, two responsive presentations.
export function SideRail() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sand bg-cream/80 px-4 py-6 lg:flex">
      <Link href="/" className="px-3">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-ember">
          Sweepza
        </span>
        <span className="mt-1 block text-[11px] text-ink/50">
          Sweepstakes, simplified.
        </span>
      </Link>

      <nav aria-label="Primary" className="mt-8 flex flex-col gap-1">
        {CONSUMER_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition",
                active
                  ? "bg-moss/10 text-moss"
                  : "text-ink/60 hover:bg-ink/5 hover:text-ink",
              )}
            >
              <Icon
                name={item.icon}
                size={20}
                weight={active ? "fill" : "regular"}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <p className="mt-auto px-3 text-[10px] uppercase tracking-[0.15em] text-ink/55">
        No purchase necessary
      </p>
    </aside>
  );
}
