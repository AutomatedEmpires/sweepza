import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { WinnerSubmissionForm, type WinnerListingOption } from "@/components/winner-submission-form";
import { getSeekerStatesForAppUser } from "@/lib/db/seeker-state";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ListingRow } from "@/lib/db/types";

export const metadata = {
  title: "Share your win",
  description: "Submit a real Sweepza win for review and publication.",
};
export const dynamic = "force-dynamic";

async function getWinnerListingOptions(
  appUserId: string,
): Promise<WinnerListingOption[]> {
  const seekerRows = await getSeekerStatesForAppUser(appUserId);
  const listingIds = [...new Set(seekerRows.flatMap((row) => {
    if (row.entered_at || row.won_at || row.saved_at) return [row.listing_id];
    return [];
  }))];

  if (listingIds.length === 0) return [];

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("id, title, end_date")
    .in("id", listingIds)
    .returns<Pick<ListingRow, "id" | "title" | "end_date">[]>();

  if (error) {
    throw new Error(`getWinnerListingOptions failed: ${error.message}`);
  }

  return (data ?? []).map((listing) => ({
    id: listing.id,
    title: listing.title,
    endDate: listing.end_date ?? undefined,
  }));
}

export default async function NewWinnerPostPage() {
  const clerkConfigured = isClerkConfigured();
  const authUser = await ensureCurrentAppUser();

  if (!clerkConfigured) {
    return (
      <section className="px-4 pb-8 pt-8">
        <div className="rounded-card border border-sand bg-white/80 p-4">
          <h1 className="text-xl font-semibold text-ink">Winner posts are unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Clerk is not configured in this environment yet, so Sweepza cannot attach winner posts to an account.
          </p>
        </div>
      </section>
    );
  }

  if (!authUser) {
    redirect("/sign-in");
  }

  const listings = await getWinnerListingOptions(authUser.appUserId);

  return (
    <section className="px-4 pb-8 pt-8">
      <div className="mb-4">
        <Link
          href="/winners"
          className="text-sm font-semibold text-moss transition hover:underline"
        >
          Back to Winner Wall
        </Link>
      </div>

      <WinnerSubmissionForm listings={listings} />
    </section>
  );
}
