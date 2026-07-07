import Link from "next/link";
import { isClerkConfigured, type SweepzaAuthUser } from "@/lib/auth";

export function ShellUtilityBar({
  authUser,
}: {
  authUser: SweepzaAuthUser | null;
}) {
  const clerkConfigured = isClerkConfigured();

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
      <span className="font-semibold uppercase tracking-[0.15em] text-ink/45">
        Sweepza
      </span>
      {clerkConfigured ? (
        authUser ? (
          <Link
            href="/profile"
            className="truncate rounded-full bg-moss/10 px-3 py-1 font-medium text-moss transition hover:bg-moss/20"
          >
            {authUser.displayName ?? authUser.email ?? "Signed in"}
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-full border border-sand px-3 py-1 font-medium text-ink/70 transition hover:bg-ink/5"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-moss px-3 py-1 font-medium text-cream transition hover:bg-moss/90"
            >
              Join
            </Link>
          </div>
        )
      ) : (
        <span className="rounded-full bg-ember/10 px-3 py-1 font-medium text-ember">
          Local mode
        </span>
      )}
    </div>
  );
}
