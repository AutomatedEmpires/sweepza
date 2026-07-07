import Link from "next/link";
import { getHostListingsSnapshot, type HostListingSummary } from "@/lib/db/host-dashboard";
import { deactivateListingAction, submitForReviewAction } from "./actions";

export const dynamic = "force-dynamic";

function formatPrize(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "No end date";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ListingCard({ listing, children }: { listing: HostListingSummary; children?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-sand bg-cream p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-ink">{listing.title}</h3>
          <p className="mt-1 text-sm text-ink/60">
            {formatPrize(listing.prizeValue)} · Ends {formatDate(listing.endDate)} · {listing.entryCount} entries
          </p>
        </div>
        <span className="rounded-full bg-sand/40 px-2 py-1 text-xs font-medium text-ink/70">
          {listing.moderationStatus}
        </span>
      </div>
      {listing.reviewNotes ? (
        <p className="mt-2 rounded-card border border-ember/25 bg-ember/5 p-2 text-sm text-ink/75">Review notes: {listing.reviewNotes}</p>
      ) : null}
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export default async function HostListingsPage() {
  const { groups } = await getHostListingsSnapshot();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">My Listings</h1>
        <Link href="/host" className="text-sm text-moss hover:underline">Back to dashboard</Link>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-ink">Active</h2>
        {groups.active.length === 0 ? (
          <p className="text-sm text-ink/60">No active listings.</p>
        ) : (
          <div className="space-y-3">
            {groups.active.map((listing) => (
              <ListingCard key={listing.id} listing={listing}>
                <form action={deactivateListingAction}>
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button type="submit" className="rounded-full border border-sand px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5">
                    Deactivate
                  </button>
                </form>
              </ListingCard>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-ink">Pending Review</h2>
        {groups.pending_review.length === 0 ? (
          <p className="text-sm text-ink/60">Nothing pending.</p>
        ) : (
          <div className="space-y-3">
            {groups.pending_review.map((listing) => (
              <ListingCard key={listing.id} listing={listing}>
                <Link href={`/host/listings/${listing.id}/edit`} className="rounded-full border border-sand px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5">
                  Edit
                </Link>
                {listing.lifecycleStatus === "draft" ? (
                  <form action={submitForReviewAction}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <button type="submit" className="rounded-full bg-moss px-3 py-1.5 text-sm font-medium text-cream hover:bg-moss/90">
                      Submit for review
                    </button>
                  </form>
                ) : null}
              </ListingCard>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-ink">Held / Rejected</h2>
        {groups.held_rejected.length === 0 ? (
          <p className="text-sm text-ink/60">Nothing held or rejected.</p>
        ) : (
          <div className="space-y-3">
            {groups.held_rejected.map((listing) => (
              <ListingCard key={listing.id} listing={listing}>
                <Link href={`/host/listings/${listing.id}/edit`} className="rounded-full border border-sand px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5">
                  Edit &amp; resubmit
                </Link>
              </ListingCard>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-ink">Expired</h2>
        {groups.expired.length === 0 ? (
          <p className="text-sm text-ink/60">No expired listings.</p>
        ) : (
          <div className="space-y-3">
            {groups.expired.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
