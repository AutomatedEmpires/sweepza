import { AdminListingClaimQueue } from "@/components/admin-listing-claim-queue";
import { listPendingListingClaims } from "@/lib/db/listing-claims";

export const metadata = {
  title: "Admin Claims",
  description: "Listing claim requests awaiting admin review.",
};

export const dynamic = "force-dynamic";

export default async function AdminClaimsPage() {
  const claims = await listPendingListingClaims();

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          Claims
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Hosts requesting ownership of owner-seeded listings.
        </p>
      </header>

      <AdminListingClaimQueue claims={claims} />
    </section>
  );
}
