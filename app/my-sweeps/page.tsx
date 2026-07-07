import Link from "next/link";
import { MySweepsDashboard } from "@/components/my-sweeps-dashboard";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import {
  getPublicListings,
  getSeekerHistoryListingsByIds,
} from "@/lib/db/listings";
import { getSeekerStateSnapshotForAppUser } from "@/lib/db/seeker-state";
import type { Listing } from "@/lib/types/listing";

export const metadata = { title: "My Sweeps" };
export const dynamic = "force-dynamic";

export default async function MySweepsPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  const listings = await getPublicListings({ limit: 100 });

  // Signed-in seekers may hold state on listings outside the feed window —
  // pull those in by id so the control center is complete.
  let merged: Listing[] = listings;
  if (authUser) {
    const snapshot = await getSeekerStateSnapshotForAppUser(authUser.appUserId);
    const known = new Set(listings.map((l) => l.id));
    const touched = new Set([
      ...Object.keys(snapshot.saved),
      ...Object.keys(snapshot.activity),
      ...Object.keys(snapshot.primary).filter(
        (id) => snapshot.primary[id] !== "none",
      ),
    ]);
    const missing = [...touched].filter((id) => !known.has(id));
    if (missing.length > 0) {
      // History query — keeps resolving ended/paused listings so Won and
      // Entered records never vanish when a sweepstake expires.
      const byIds = await getSeekerHistoryListingsByIds(missing);
      merged = [...listings, ...byIds];
    }
  }

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex flex-col gap-1 px-1">
        <h1 className="font-display text-3xl text-ink">My Sweeps</h1>
        <p className="text-sm text-ink/60">
          Everything you&apos;re tracking — ready to enter, in play, and won.
        </p>
      </header>
      {clerkConfigured && !authUser ? (
        <div className="mb-4 rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-sm font-semibold text-ink">
            Sign in to sync your sweep activity
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink/65">
            This browser tracks your sweeps locally. A signed-in account keeps
            saved, entered, and won state connected to your Sweepza profile on
            every device.
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
      <MySweepsDashboard listings={merged} />
    </section>
  );
}
