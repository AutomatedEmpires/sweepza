import { SeekerDashboard } from "@/components/seeker-dashboard";
import { getPublicListings } from "@/lib/db/listings";

export const metadata = { title: "Saved" };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const listings = await getPublicListings({ limit: 100 });

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex flex-col gap-1 px-1">
        <h1 className="text-2xl font-bold text-ink">Your sweeps</h1>
        <p className="text-sm text-ink/60">
          Track what you have saved, entered, and skipped.
        </p>
      </header>
      <SeekerDashboard listings={listings} />
    </section>
  );
}
