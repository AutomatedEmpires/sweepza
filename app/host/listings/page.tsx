import Link from "next/link";
import { Icon } from "@/components/icon";
import { getHostListingsSnapshot, type HostListingSummary } from "@/lib/db/host-dashboard";
import { deactivateListingAction, reactivateListingAction, submitForReviewAction } from "./actions";

export const dynamic = "force-dynamic";

function formatPrize(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "No end date";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function moderationStatusStyles(status: string): string {
  if (status === "clear") return "bg-pine/10 text-pine";
  if (["flagged", "action_taken", "rejected", "held"].includes(status)) return "bg-flame/10 text-flame";
  if (["under_review", "submitted"].includes(status)) return "bg-ocean/10 text-ocean";
  return "bg-ink/5 text-graphite";
}

function EmptySection({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-line bg-paper px-4 py-6 text-center text-sm text-graphite">
      {label}
    </p>
  );
}

function ListingCard({ listing, children }: { listing: HostListingSummary; children?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-ink">{listing.title}</h3>
          <p className="mt-1 text-sm text-graphite">
            {formatPrize(listing.prizeValue)} · Ends {formatDate(listing.endDate)} · {listing.entryCount} entries
          </p>
        </div>
        <span className={`shrink-0 rounded-pill px-2 py-1 text-xs font-medium capitalize ${moderationStatusStyles(listing.moderationStatus)}`}>
          {listing.moderationStatus.replaceAll("_", " ")}
        </span>
      </div>
      {listing.reviewNotes ? (
        <p className="mt-2 rounded-xl border border-flame/25 bg-flame/5 p-2 text-sm text-ink/75">Review notes: {listing.reviewNotes}</p>
      ) : null}
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export default async function HostListingsPage() {
  const { groups } = await getHostListingsSnapshot();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-8">
      <header className="mb-6 flex items-start justify-between gap-3 px-1">
        <h1 className="font-display text-3xl text-ink">My Listings</h1>
        <Link
          href="/host"
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper"
        >
          Dashboard
        </Link>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">Active</h2>
        {groups.active.length === 0 ? (
          <EmptySection label="No active listings." />
        ) : (
          <div className="space-y-3">
            {groups.active.map((listing) => (
              <ListingCard key={listing.id} listing={listing}>
                <form action={deactivateListingAction}>
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-ink/75 transition hover:bg-paper">
                    Deactivate
                  </button>
                </form>
              </ListingCard>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">Pending review</h2>
        {groups.pending_review.length === 0 ? (
          <EmptySection label="Nothing pending." />
        ) : (
          <div className="space-y-3">
            {groups.pending_review.map((listing) => (
              <ListingCard key={listing.id} listing={listing}>
                <Link href={`/host/listings/${listing.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-ink/75 transition hover:bg-paper">
                  Edit
                </Link>
                {listing.lifecycleStatus === "draft" ? (
                  <form action={submitForReviewAction}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-3 py-1.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90">
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
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">Held / rejected</h2>
        {groups.held_rejected.length === 0 ? (
          <EmptySection label="Nothing held or rejected." />
        ) : (
          <div className="space-y-3">
            {groups.held_rejected.map((listing) => (
              <ListingCard key={listing.id} listing={listing}>
                {listing.lifecycleStatus === "held" || listing.moderationStatus === "held" ? (
                  <Link href={`/host/listings/${listing.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-ink/75 transition hover:bg-paper">
                    Edit &amp; resubmit
                  </Link>
                ) : (
                  <span className="text-sm text-graphite">Rejected listings cannot be resubmitted. Create a corrected new promotion only if it has a distinct official identity.</span>
                )}
              </ListingCard>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">Expired</h2>
        {groups.expired.length === 0 ? (
          <EmptySection label="No expired listings." />
        ) : (
          <div className="space-y-3">
            {groups.expired.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">Inactive</h2>
        {groups.inactive.length === 0 ? (
          <EmptySection label="No inactive listings." />
        ) : (
          <div className="space-y-3">
            {groups.inactive.map((listing) => (
              <ListingCard key={listing.id} listing={listing}>
                <Link href={`/host/listings/${listing.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-ink/75 transition hover:bg-paper">
                  Edit &amp; re-review
                </Link>
                <form action={reactivateListingAction}>
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-3 py-1.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90">
                    Reactivate unchanged
                  </button>
                </form>
              </ListingCard>
            ))}
          </div>
        )}
      </section>

      {groups.active.length === 0 &&
      groups.pending_review.length === 0 &&
      groups.held_rejected.length === 0 &&
      groups.expired.length === 0 &&
      groups.inactive.length === 0 ? (
        <div className="mt-2 flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-4 py-10 text-center shadow-e1">
          <Icon name="gift" size={22} className="text-graphite" />
          <p className="text-sm leading-relaxed text-graphite">
            No listings yet — create your first from the host dashboard.
          </p>
          <Link
            href="/host#submit-listing"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
          >
            Create your first listing
          </Link>
        </div>
      ) : null}
    </div>
  );
}
