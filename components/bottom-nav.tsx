"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Seeker-leaning bottom nav for MVP. Full role-scoped nav (seeker Me tab,
// host-mode nav) arrives with auth in Lane B / Phase 4.
const items = [
  { href: "/discover", label: "Discover" },
  { href: "/saved", label: "Saved" },
  { href: "/winners", label: "Winners" },
  { href: "/host", label: "Host" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md items-stretch border-t border-sand bg-cream/95 backdrop-blur"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs font-medium",
              active ? "text-ember" : "text-ink/60",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                active ? "bg-ember" : "bg-transparent",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
