import Link from "next/link";
import { getHostListingsSnapshot } from "@/lib/db/host-dashboard";
import { formatPrizeValue } from "@/lib/listing-format";
import { deactivateListingAction, submitForReviewAction } from "./actions";

export const metadata = { title: "Host Listings" };

function groupLabel(key: string) {
  switch (key) {
    case "active":
      return "Active";
    case "pending_review":
      return "Pending Review";
    case "expired":
      return "Expired";
    case "held_rejected":
      return "Held / Rejected";
    default:
      return key;
  }
}

export default async function HostListingsPage() {
  const snapshot = await getHostListingsSnapshot();

  return (
    <section className="px-5 pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Your listings</h1>
          <p className="mt-2 text-sm text-ink/60">All lifecycle statuses, grouped for quick action.</p>
        </div>
        <Link className="text-sm font-medium text-accent" href="/host">Back</Link>
      </header>

      <div className="mt-6 grid gap-6">
        {Object.entries(snapshot.groups).map(([groupKey, listings]) => (
          <section key={groupKey} className="rounded-2xl border border-ink/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">{groupLabel(groupKey)}</h2>
            <div className="mt-3 grid gap-3">
              {listings.length === 0 ? (
                <p className="text-sm text-ink/50">No listings.</p>
              ) : (
                listings.map((l) => (
                  <article key={l.id} className="rounded-xl border border-ink/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-ink">{l.title}</h3>
                        <p className="mt-1 text-xs text-ink/60">
                          {formatPrizeValue(l.prizeValue ?? undefined) ?? "—"} · Ends {l.endDate ?? "—"} · Entries {l.entryCount}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-ink/5 px-2 py-1 text-[11px] font-medium text-ink/70">{l.moderationStatus}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {l.lifecycleStatus === "draft" && (
                        <form action={submitForReviewAction.bind(null, l.id)}>
                          <button className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">Submit for review</button>
                        </form>
                      )}

                      {l.lifecycleStatus === "active" && (
                        <form action={deactivateListingAction.bind(null, l.id)}>
                          <button className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink">Deactivate</button>
                        </form>
                      )}

                      {(l.lifecycleStatus === "draft" || l.moderationStatus === "held" || l.lifecycleStatus === "held") && (
                        <Link className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink" href={`/host/listings/${l.id}/edit`}>Edit</Link>
                      )}

                      {(l.moderationStatus === "held" || l.moderationStatus === "rejected" || l.lifecycleStatus === "held" || l.lifecycleStatus === "rejected") && l.reviewNotes ? (
                        <details className="w-full rounded-lg border border-ink/10 bg-ink/[0.02] px-3 py-2">
                          <summary className="cursor-pointer text-xs font-semibold text-ink">Review notes</summary>
                          <p className="mt-2 text-xs text-ink/70">{l.reviewNotes}</p>
                        </details>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
