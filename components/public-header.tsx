import Link from "next/link";
import { BrandLockup } from "@/components/brand";
import { Icon } from "@/components/icon";
import { isClerkConfigured } from "@/lib/auth";

const PUBLIC_LINKS = [
  { href: "/", label: "Today" },
  { href: "/discover", label: "Discover" },
  { href: "/my-sweeps", label: "My sweeps" },
  { href: "/winners", label: "Winners" },
  { href: "/profile", label: "Profile" },
  { href: "/host", label: "For sponsors" },
] as const;

export function PublicHeader() {
  const clerkConfigured = isClerkConfigured();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-6 lg:h-[72px] lg:px-10">
        <BrandLockup />

        <nav aria-label="Public navigation" className="hidden items-center gap-1 lg:flex">
          {PUBLIC_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-xl px-3.5 text-sm font-semibold text-graphite transition hover:bg-ink/5 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {clerkConfigured ? (
            <Link
              href="/sign-in"
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-ink transition hover:bg-ink/5"
            >
              Sign in
            </Link>
          ) : null}
          <Link
            href={clerkConfigured ? "/sign-up" : "/discover"}
            className="inline-flex min-h-11 items-center rounded-xl bg-ember px-5 text-sm font-bold text-on-accent shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2"
          >
            {clerkConfigured ? "Start free" : "Browse sweeps"}
          </Link>
        </div>

        <Link
          href={clerkConfigured ? "/sign-up" : "/profile"}
          aria-label={
            clerkConfigured
              ? "Create a free Sweepza account"
              : "Open your Sweepza profile"
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 text-sm font-bold text-ink shadow-e1 transition hover:bg-gold/20 lg:hidden"
        >
          <Icon
            name={clerkConfigured ? "sparkle" : "profile"}
            size={18}
            className="text-gold"
          />
          {clerkConfigured ? "Join free" : "Profile"}
        </Link>
      </div>
    </header>
  );
}
