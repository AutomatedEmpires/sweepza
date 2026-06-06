import Link from "next/link";
import { AdminWinnerQueue } from "@/components/admin-winner-queue";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getWinnerModerationQueue } from "@/lib/db/winner-moderation";

export const metadata = {
  title: "Winner Moderation",
  description: "Approve, hide, or reject Winner Wall submissions on Sweepza.",
};

export const dynamic = "force-dynamic";

export default async function AdminWinnersPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();

  if (!clerkConfigured) {
    return (
      <section className="px-5 pb-10 pt-8">
        <div className="rounded-card border border-sand bg-white/80 p-5">
          <h1 className="text-2xl font-bold text-ink">
            Winner moderation unavailable
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Clerk is not configured in this environment yet, so admin identity
            cannot be verified.
          </p>
        </div>
      </section>
    );
  }

  if (!authUser) {
    return (
      <section className="px-5 pb-10 pt-8">
        <div className="rounded-card border border-sand bg-white/80 p-5">
          <h1 className="text-2xl font-bold text-ink">Sign in required</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Winner moderation is only available to authenticated Sweepza admins
            or owners.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
            >
              Sign in
            </Link>
            <Link
              href="/discover"
              className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
            >
              Back to discover
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!authUser.appUser.is_admin && !authUser.appUser.is_owner) {
    return (
      <section className="px-5 pb-10 pt-8">
        <div className="rounded-card border border-sand bg-white/80 p-5">
          <h1 className="text-2xl font-bold text-ink">Admin access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Winner moderation is limited to Sweepza admin and owner accounts.
          </p>
        </div>
      </section>
    );
  }

  const posts = await getWinnerModerationQueue();

  return (
    <section className="px-5 pb-10 pt-8">
      <div className="flex flex-col gap-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Trust &amp; safety
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            Winner submission moderation
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Approve submissions onto the public Winner Wall, hide posts that are
            already live, or reject and keep them private.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/admin/reports"
              className="inline-flex rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
            >
              Reports queue
            </Link>
            <Link
              href="/admin/review"
              className="inline-flex rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
            >
              Listing review
            </Link>
          </div>
        </header>

        <AdminWinnerQueue posts={posts} />
      </div>
    </section>
  );
}
