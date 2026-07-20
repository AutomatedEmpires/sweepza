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
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-paper/80 px-4 py-6 lg:flex">
      <Link href="/" className="px-3">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-ember">
          Sweepza
        </span>
        <span className="mt-1 block text-[11px] text-graphite">
          The sweepstakes operating system
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
                "flex min-h-10 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                active
                  ? "bg-ember/10 text-ember"
                  : "text-graphite hover:bg-ink/5 hover:text-ink",
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

      {/* Was: "No purchase necessary" — the rail renders on every page, so this asserted
          the sponsor's legal representation site-wide. Sweepza's own fee is all we can state. */}
      <p className="mt-auto px-3 text-[10px] uppercase tracking-[0.15em] text-graphite">
        Free for seekers
      </p>
    </aside>
  );
}
