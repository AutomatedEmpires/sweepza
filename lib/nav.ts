import type { IconName } from "@/components/icon";

// Canonical consumer navigation — single source for the mobile bottom nav and
// the desktop side rail. Host and admin surfaces are reached through Profile
// (role-aware), not from a permanent consumer tab.
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Additional path prefixes that keep this item active. */
  match?: string[];
}

export const CONSUMER_NAV_ITEMS: NavItem[] = [
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

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.match ?? [])].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
