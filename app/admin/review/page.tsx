import Link from "next/link";
import { AdminReviewQueue } from "@/components/admin-review-queue";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getHostReviewQueue } from "@/lib/db/listing-review";

export const metadata = {
  title: "Admin Review",
  description: "Review host-submitted listings before they go public on Sweepza.",
};

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();

  if (!clerkConfigured) {
    return (
      <section className="px-5 pb-10 pt-8">
        <div className="rounded-card border border-sand bg-white/80 p-5">
          <h1 className="text-2xl font-bold text-ink">Admin review unavailable</h1>
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
            Listing review is only available to authenticated Sweepza admins or
            owners.
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
            This review queue is limited to Sweepza admin and owner accounts.
          </p>
        </div>
      </section>
    );
  }

  const listings = await getHostReviewQueue();

  return (
    <section className="px-5 pb-10 pt-8">
      <div className="flex flex-col gap-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            Host submission review
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            Approve host-submitted listings into public Discover, hold them for
            more work, or reject them with internal notes.
          </p>
          <div className="mt-3">
            <Link
              href="/admin/import"
              className="inline-flex rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
            >
              Go to manual import
            </Link>
          </div>
        </header>

        <AdminReviewQueue listings={listings} />
      </div>
    </section>
  );
}
