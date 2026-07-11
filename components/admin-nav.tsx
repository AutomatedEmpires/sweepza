"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminNavCounts {
  pending_listings: number;
  pending_winners: number;
  open_reports: number;
  pending_hosts: number;
}

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export function AdminNav({ counts }: { counts: AdminNavCounts }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/listings", label: "Listings", badge: counts.pending_listings },
    { href: "/admin/hosts", label: "Hosts", badge: counts.pending_hosts },
    { href: "/admin/reports", label: "Reports", badge: counts.open_reports },
    { href: "/admin/claims", label: "Claims" },
    { href: "/admin/winners", label: "Winners", badge: counts.pending_winners },
    { href: "/admin/notifications", label: "Notifications" },
  ];

  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="border-b border-line md:w-60 md:shrink-0 md:border-b-0 md:border-r md:py-8">
      <div className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:gap-1 md:overflow-visible md:px-4 md:py-0">
        <p className="hidden px-3 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ember md:block">
          Admin
        </p>
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-pill px-4 py-2 text-sm font-semibold transition md:rounded-xl ${
                active
                  ? "bg-ink text-paper"
                  : "text-ink/70 hover:bg-paper"
              }`}
            >
              <span>{item.label}</span>
              {typeof item.badge === "number" && item.badge > 0 ? (
                <span className="nums inline-flex min-w-[1.25rem] items-center justify-center rounded-pill bg-ember px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
