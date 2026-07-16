import Link from "next/link";
import { isClerkConfigured, type SweepzaAuthUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export function ShellUtilityBar({
  authUser,
}: {
  authUser: SweepzaAuthUser | null;
}) {
  const clerkConfigured = isClerkConfigured();

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs lg:justify-end lg:px-8">
      {/* Brand lives in the desktop side rail; keep it mobile-only here. */}
      <span className="font-semibold uppercase tracking-[0.15em] text-graphite lg:hidden">
        Sweepza
      </span>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      {clerkConfigured ? (
        authUser ? (
          <Link
            href="/profile"
            className="inline-flex min-h-11 min-w-0 items-center rounded-pill bg-pine/10 px-3 py-2 font-medium text-pine transition hover:bg-pine/20"
          >
            <span className="truncate">
              {authUser.displayName ?? authUser.email ?? "Signed in"}
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 font-medium text-ink/75 transition hover:bg-ink/5"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex min-h-11 items-center rounded-xl bg-ember px-3 py-2 font-medium text-on-accent transition hover:bg-ember/90"
            >
              Join
            </Link>
          </div>
        )
      ) : (
        <span className="rounded-pill bg-ember/10 px-3 py-1 font-medium text-ember">
          Local mode
        </span>
      )}
      </div>
    </div>
  );
}
