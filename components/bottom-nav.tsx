"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/cn";

// Consumer-first primary navigation. Host and admin surfaces are reached
// through Profile (role-aware), not from a permanent consumer tab.
const items: {
  href: string;
  label: string;
  icon: IconName;
  /** Additional path prefixes that keep this tab active. */
  match?: string[];
}[] = [
  { href: "/", label: "Today", icon: "today" },
  {
    href: "/discover",
    label: "Discover",
    icon: "discover",
    match: ["/search", "/listings", "/sweeps"],
  },
  { href: "/my-sweeps", label: "My Sweeps", icon: "sweeps", match: ["/saved"] },
  { href: "/winners", label: "Winners", icon: "trophy" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md items-stretch border-t border-sand bg-cream/95 backdrop-blur"
    >
      {items.map((item) => {
        const prefixes = [item.href, ...(item.match ?? [])];
        const active =
          item.href === "/"
            ? pathname === "/"
            : prefixes.some(
                (prefix) =>
                  pathname === prefix || pathname.startsWith(`${prefix}/`),
              );
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
