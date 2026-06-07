import Link from "next/link";
import { editHostListing, getHostListingForEdit } from "@/lib/db/host-dashboard";

export const metadata = { title: "Edit listing" };

export default async function HostListingEditPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  const listing = await getHostListingForEdit(listingId);

  return (
    <section className="px-5 pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Edit listing</h1>
          <p className="mt-2 text-sm text-ink/60">Only drafts (and held) can be edited.</p>
        </div>
        <Link className="text-sm font-medium text-accent" href="/host/listings">
          Back
        </Link>
      </header>

      <form action={editHostListing} className="mt-6 grid gap-4">
        <input type="hidden" name="listingId" value={listing.id} />

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-ink">Title</span>
          <input
            className="h-11 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink"
            name="title"
            defaultValue={listing.title}
            required
            maxLength={70}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-ink">Short description</span>
          <textarea
            className="min-h-24 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink"
            name="short_description"
            defaultValue={listing.short_description}
            required
            maxLength={140}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-ink">Prize name</span>
          <input
            className="h-11 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink"
            name="prize_name"
            defaultValue={listing.prize_name}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-ink">Prize value (USD)</span>
          <input
            className="h-11 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink"
            name="prize_value"
            defaultValue={listing.prize_value ?? ""}
            inputMode="decimal"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-ink">Entry URL</span>
          <input
            className="h-11 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink"
            name="entry_url"
            defaultValue={listing.entry_url ?? ""}
          />
        </label>

        <button className="mt-2 h-11 rounded-xl bg-accent text-sm font-semibold text-white">
          Save
        </button>
      </form>
    </section>
  );
}
