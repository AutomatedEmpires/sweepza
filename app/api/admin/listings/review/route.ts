import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getReviewListingById } from "@/lib/db/listing-review";
import { revalidatePublicListings } from "@/lib/db/listings-cache";
import { sendHostNotification } from "@/lib/email/notifications";
import { env } from "@/lib/env";
import { listingReviewSchema } from "@/lib/listing-review-schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function listingUrlFor(slug: string): string {
  const base = env.NEXT_PUBLIC_APP_URL ?? "https://sweepza.com";
  return `${base.replace(/\/$/, "")}/sweeps/${slug}`;
}

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

  const parsed = listingReviewSchema.safeParse(
    await request.json().catch(() => null),
  );
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

  if (!["host_submitted", "owner_seeded", "claimed_host"].includes(listing.source_type)) {
    return NextResponse.json(
      { error: "This listing source is not reviewable here." },
      { status: 409 },
    );
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .rpc("review_canonical_listing", {
      p_listing_id: listingId,
      p_reviewer_user_id: authUser.appUserId,
      p_action: action,
      p_review_notes: reviewNotes ?? null,
    });

  if (error) {
    // Surfaces listing_publish_guard / enforce_active_listing_cap trigger errors.
    return NextResponse.json(
      { error: "Review failed because the listing does not meet the requested state." },
      { status: 422 },
    );
  }

  // Every review outcome flips public visibility (approve → live, reject/hold
  // → private), so refresh the shared feed regardless of which action ran.
  revalidatePublicListings();

  // Fire transactional email for approve (live) / keep_pending (held).
  // Email delivery must never block or fail the review action.
  if (
    listing.host_id &&
    (action === "approve" || action === "needs_changes")
  ) {
    try {
      let hostName = "there";
      const { data: host } = await supabase
        .from("host")
        .select("display_name")
        .eq("id", listing.host_id)
        .maybeSingle<{ display_name: string | null }>();
      if (host?.display_name) {
        hostName = host.display_name;
      }

      if (action === "approve") {
        await sendHostNotification({
          hostId: listing.host_id,
          type: "listing_approved",
          payload: {
            hostName,
            listingTitle: listing.title,
            listingUrl: listingUrlFor(listing.slug),
          },
        });
      } else {
        await sendHostNotification({
          hostId: listing.host_id,
          type: "listing_held",
          payload: {
            hostName,
            listingTitle: listing.title,
            reviewNotes: reviewNotes ?? "",
          },
        });
      }
    } catch (notifyError) {
      // eslint-disable-next-line no-console
      console.error("listing review notification failed", notifyError);
    }
  }

  return NextResponse.json({ ok: true, action, listing: data });
}
