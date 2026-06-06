import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import {
  assertHostCanActivateListing,
  computeHostEntitlement,
  ListingQuotaError,
} from "@/lib/billing/entitlements";
import {
  countActiveListingsForHost,
  getLatestSubscriptionForHost,
} from "@/lib/db/hosts";
import { getReviewListingById } from "@/lib/db/listing-review";
import { listingReviewSchema } from "@/lib/listing-review-schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Clerk is not configured for this environment." },
      { status: 503 },
    );
  }

  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!authUser.appUser.is_admin && !authUser.appUser.is_owner) {
    return NextResponse.json(
      { error: "Admin or owner access required." },
      { status: 403 },
    );
  }

  const parsed = listingReviewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { listingId, action, reviewNotes } = parsed.data;

  const listing = await getReviewListingById(listingId);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  if (listing.source_type !== "host_submitted") {
    return NextResponse.json(
      { error: "Only host-submitted listings can be reviewed here." },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {};

  if (reviewNotes !== undefined) {
    updates.review_notes_internal = reviewNotes ?? null;
  }

  if (action === "approve") {
    // Approving a host listing is the real activation gate. Enforce the host's
    // status-aware active-listing allowance here, before flipping it live, so
    // reviewers get a clear quota error instead of a raw DB trigger failure.
    // The enforce_active_listing_cap DB trigger remains the hard backstop.
    if (listing.host_id && listing.lifecycle_status !== "active") {
      const [subscription, activeListings] = await Promise.all([
        getLatestSubscriptionForHost(listing.host_id),
        countActiveListingsForHost(listing.host_id, listing.id),
      ]);
      const entitlement = computeHostEntitlement(subscription, activeListings);

      try {
        assertHostCanActivateListing(entitlement);
      } catch (error) {
        if (error instanceof ListingQuotaError) {
          return NextResponse.json(
            {
              error: error.message,
              quota: {
                status: entitlement.status,
                allowance: entitlement.effectiveAllowance,
                activeListings: entitlement.activeListingCount,
                remaining: entitlement.remainingActiveSlots,
              },
            },
            { status: 422 },
          );
        }
        throw error;
      }
    }

    updates.lifecycle_status = "active";
    updates.visibility_status = "public";
    updates.published_at = listing.published_at ?? new Date().toISOString();
    if (listing.listing_verification_status === "unreviewed") {
      updates.listing_verification_status = "reviewed";
    }
  } else if (action === "reject") {
    updates.lifecycle_status = "rejected";
    updates.visibility_status = "private";
  } else {
    // keep_pending
    updates.lifecycle_status = "pending_review";
    updates.visibility_status = "private";
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .update(updates)
    .eq("id", listingId)
    .select(
      "id, slug, lifecycle_status, visibility_status, listing_verification_status",
    )
    .single<{
      id: string;
      slug: string;
      lifecycle_status: string;
      visibility_status: string;
      listing_verification_status: string;
    }>();

  if (error) {
    // Surfaces listing_publish_guard / enforce_active_listing_cap trigger errors.
    return NextResponse.json(
      { error: `Review update failed: ${error.message}` },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, action, listing: data });
}
