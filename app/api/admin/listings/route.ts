import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { adminListingImportSchema } from "@/lib/admin-listing-schema";
import { revalidatePublicListings } from "@/lib/db/listings-cache";
import { makeUniqueListingSlug } from "@/lib/slug";
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = adminListingImportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const slug = await makeUniqueListingSlug(input.title);
  const supabase = createServiceRoleClient();

  const { data: listing, error: listingError } = await supabase
    .from("listing")
    .insert({
      slug,
      title: input.title,
      short_description: input.shortDescription,
      prize_name: input.prizeName,
      prize_value: input.prizeValue ?? null,
      prize_currency: "USD",
      prize_category: input.prizeCategory,
      main_image_url: input.mainImageUrl ?? null,
      image_source_type: input.mainImageUrl ? "external_reference" : null,
      image_alt_text: input.imageAltText ?? null,
      entry_url: input.entryUrl,
      official_rules_url: input.officialRulesUrl,
      end_date: input.endDate,
      entry_frequency: input.entryFrequency,
      eligibility_country: input.eligibilityCountry,
      source_type: "owner_seeded",
      public_source_label: input.sourceLabel,
      created_by_role: "owner",
      created_by_user_id: authUser.appUserId,
      sponsor_name: input.sponsorName ?? null,
      lifecycle_status: input.publish ? "active" : "draft",
      visibility_status: input.publish ? "public" : "private",
      listing_verification_status: input.verified ? "verified" : "reviewed",
      published_at: input.publish ? new Date().toISOString() : null,
    })
    .select("id, slug")
    .single<{ id: string; slug: string }>();

  if (listingError) {
    return NextResponse.json(
      { error: `Listing insert failed: ${listingError.message}` },
      { status: 500 },
    );
  }

  // The row is already live at this point; invalidate before the tag insert so
  // a later tag failure (which returns early) can't strand a published listing
  // out of the cached feed. Drafts stay private and don't enter the feed.
  if (input.publish) {
    revalidatePublicListings();
  }

  if (input.tagCodes.length > 0) {
    const { error: tagError } = await supabase.from("listing_tag").insert(
      input.tagCodes.map((tagCode) => ({
        listing_id: listing.id,
        tag_code: tagCode,
      })),
    );

    if (tagError) {
      return NextResponse.json(
        { error: `Listing created but tags failed: ${tagError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    id: listing.id,
    slug: listing.slug,
    url: `/sweeps/${listing.slug}`,
  });
}
