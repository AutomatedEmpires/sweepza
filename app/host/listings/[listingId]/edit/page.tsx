import Link from "next/link";
import { notFound } from "next/navigation";
import { getHostListingForEdit, HostAccessError } from "@/lib/db/host-dashboard";
import { editHostListingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditHostListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;

  let listing;
  try {
    listing = await getHostListingForEdit(listingId);
  } catch (error) {
    if (error instanceof HostAccessError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-8">
      <header className="mb-6 flex items-start justify-between gap-3 px-1">
        <h1 className="font-display text-3xl text-ink">Edit listing</h1>
        <Link
          href="/host/listings"
          className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper"
        >
          Cancel
        </Link>
      </header>

      {listing.review_notes ? (
        <p className="mb-4 rounded-card border border-flame/25 bg-flame/5 p-3 text-sm text-ink/75">Review notes: {listing.review_notes}</p>
      ) : null}

      <form action={editHostListingAction} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-e1">
        <input type="hidden" name="listingId" value={listing.id} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Title</span>
          <input id="title" name="title" defaultValue={listing.title} required minLength={5} maxLength={70}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Short description</span>
          <textarea id="short_description" name="short_description" defaultValue={listing.short_description} required minLength={10} maxLength={140} rows={3}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Prize name</span>
          <input id="prize_name" name="prize_name" defaultValue={listing.prize_name} required minLength={3} maxLength={120}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Prize value (USD)</span>
          <input id="prize_value" name="prize_value" type="number" min={0} step="1" defaultValue={listing.prize_value ?? ""}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Entry URL</span>
          <input id="entry_url" name="entry_url" type="url" defaultValue={listing.entry_url ?? ""}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none" />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90">
          Save changes
        </button>
      </form>
    </div>
  );
}
