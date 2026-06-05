import { SeekerDashboard } from "@/components/seeker-dashboard";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getPublicListings } from "@/lib/db/listings";
import Link from "next/link";

export const metadata = { title: "Saved" };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  const listings = await getPublicListings({ limit: 100 });

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex flex-col gap-1 px-1">
        <h1 className="text-2xl font-bold text-ink">Your sweeps</h1>
        <p className="text-sm text-ink/60">
          Track what you have saved, entered, and skipped.
        </p>
      </header>
      {clerkConfigured && !authUser ? (
        <div className="mb-4 rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-sm font-semibold text-ink">
            Sign in to sync your sweep activity
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink/65">
            Your current browser can still track saved items locally, but a
            signed-in account keeps saved, entered, and skipped state connected
            to your Sweepza profile.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
            >
              Create account
            </Link>
          </div>
        </div>
      ) : null}
      <SeekerDashboard listings={listings} />
    </section>
  );
}
