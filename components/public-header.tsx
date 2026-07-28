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
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-10">
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

        <details className="group relative lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <Icon name="menu" size={20} />
            Menu
          </summary>
          <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(19rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-2 shadow-e3">
            <nav aria-label="Mobile public navigation" className="flex flex-col">
              {PUBLIC_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-11 items-center rounded-xl px-3.5 text-sm font-semibold text-ink hover:bg-ink/5"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-2">
              {clerkConfigured ? (
                <Link
                  href="/sign-in"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 text-sm font-semibold text-ink"
                >
                  Sign in
                </Link>
              ) : null}
              <Link
                href={clerkConfigured ? "/sign-up" : "/discover"}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-3 text-sm font-bold text-on-accent"
              >
                {clerkConfigured ? "Start free" : "Browse"}
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
