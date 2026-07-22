import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getHostListingForEdit,
  getHostListingTagCodes,
  HostAccessError,
} from "@/lib/db/host-dashboard";
import { getActiveCategories, getActiveTags } from "@/lib/db/dictionaries";
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

  const [categories, tags, selectedTagCodes] = await Promise.all([
    getActiveCategories(),
    getActiveTags(),
    getHostListingTagCodes(listingId),
  ]);

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
          <span className="font-medium text-ink">Promotion summary</span>
          <textarea id="long_description" name="long_description" defaultValue={listing.long_description ?? ""} maxLength={2000} rows={5}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Category</span>
            <select name="prize_category" defaultValue={listing.prize_category ?? ""} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none">
              <option value="">Select category</option>
              {categories.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Winner count</span>
            <input name="winner_count" type="number" min={1} defaultValue={listing.winner_count ?? ""} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Main image URL</span>
            <input name="main_image_url" type="url" defaultValue={listing.main_image_url ?? ""} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Image alt text</span>
            <input name="image_alt_text" defaultValue={listing.image_alt_text ?? ""} maxLength={160} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Entry URL</span>
          <input id="entry_url" name="entry_url" type="url" defaultValue={listing.entry_url ?? ""} required
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Official rules URL</span>
          <input name="official_rules_url" type="url" defaultValue={listing.official_rules_url ?? ""} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Start date</span>
            <input name="start_date" type="date" defaultValue={listing.start_date ?? ""} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">End date</span>
            <input name="end_date" type="date" defaultValue={listing.end_date ?? ""} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Entry frequency</span>
            <select name="entry_frequency" defaultValue={listing.entry_frequency ?? "one_time"} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none">
              <option value="one_time">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="instant_win">Instant win</option><option value="other">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Entry limit details</span>
            <input name="entry_limit_notes" defaultValue={listing.entry_limit_notes ?? ""} maxLength={240} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Eligibility country</span>
            <input name="eligibility_country" defaultValue={listing.eligibility_country ?? "US"} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-ink">Eligible state codes</span>
            <input name="eligibility_states" defaultValue={listing.eligibility_states?.join(", ") ?? ""} placeholder="Blank for nationwide or CA, NY" className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Minimum age</span>
            <input name="age_requirement" type="number" min={13} max={120} defaultValue={listing.age_requirement ?? 18} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Sponsor name</span>
            <input name="sponsor_name" defaultValue={listing.sponsor_name ?? ""} required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Sponsor website</span>
          <input name="sponsor_url" type="url" defaultValue={listing.sponsor_url ?? ""} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
        </label>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-medium text-ink">Tags</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {tags.map((tag) => <label key={tag.code} className="flex min-h-11 items-center gap-2 text-sm text-graphite"><input type="checkbox" name="tag_codes" value={tag.code} defaultChecked={selectedTagCodes.includes(tag.code)} />{tag.label}</label>)}
          </div>
        </fieldset>
        <label className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3 text-sm leading-relaxed text-ink">
          <input type="checkbox" name="no_purchase_necessary" defaultChecked={listing.no_purchase_necessary === true} required className="mt-1" />
          No purchase is necessary to enter or win, as stated in the official rules.
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90">
          Save changes for re-review
        </button>
      </form>
    </div>
  );
}
