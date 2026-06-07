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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Edit Listing</h1>
        <Link href="/host/listings" className="text-sm text-indigo-600 hover:underline">Cancel</Link>
      </div>

      {listing.review_notes ? (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Review notes: {listing.review_notes}</p>
      ) : null}

      <form action={editHostListingAction} className="space-y-4">
        <input type="hidden" name="listingId" value={listing.id} />
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Title</label>
          <input id="title" name="title" defaultValue={listing.title} required minLength={5} maxLength={70}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor="short_description" className="block text-sm font-medium text-gray-700">Short description</label>
          <textarea id="short_description" name="short_description" defaultValue={listing.short_description} required minLength={10} maxLength={140} rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor="prize_name" className="block text-sm font-medium text-gray-700">Prize name</label>
          <input id="prize_name" name="prize_name" defaultValue={listing.prize_name} required minLength={3} maxLength={120}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor="prize_value" className="block text-sm font-medium text-gray-700">Prize value (USD)</label>
          <input id="prize_value" name="prize_value" type="number" min={0} step="1" defaultValue={listing.prize_value ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor="entry_url" className="block text-sm font-medium text-gray-700">Entry URL</label>
          <input id="entry_url" name="entry_url" type="url" defaultValue={listing.entry_url ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
        </div>
        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          Save changes
        </button>
      </form>
    </div>
  );
}
