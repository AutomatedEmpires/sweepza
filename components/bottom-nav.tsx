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
      className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md items-stretch border-t border-sand bg-cream/95 backdrop-blur lg:hidden"
    >
      {CONSUMER_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 pb-2.5 pt-2 text-[10px] font-semibold",
              active ? "text-ember" : "text-ink/55",
            )}
          >
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
