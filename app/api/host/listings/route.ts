import { NextResponse } from "next/server";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { computeHostEntitlement } from "@/lib/billing/entitlements";
import {
  countActiveListingsForHost,
  getHostByAppUserId,
  getLatestSubscriptionForHost,
} from "@/lib/db/hosts";
import { hostListingSubmissionSchema } from "@/lib/host-listing-schema";
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

  if (!authUser.appUser.is_host) {
    return NextResponse.json({ error: "Host access required." }, { status: 403 });
  }

  const host = await getHostByAppUserId(authUser.appUserId);
  if (!host) {
    return NextResponse.json(
      { error: "Host profile is missing for this account." },
      { status: 409 },
    );
  }

  const parsed = hostListingSubmissionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const slug = await makeUniqueListingSlug(input.title);
  const supabase = createServiceRoleClient();

  // New host listings are always created as private drafts, so creation itself
  // is never blocked by quota. We still compute the host's entitlement so the
  // response can warn when this draft cannot go live under the current plan.
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
      source_type: "host_submitted",
      public_source_label: "host_submitted",
      created_by_role: "host",
      created_by_user_id: authUser.appUserId,
      host_id: host.id,
      sponsor_name: input.sponsorName ?? null,
      lifecycle_status: "draft",
      visibility_status: "private",
      listing_verification_status: "unreviewed",
      published_at: null,
    })
    .select("id, slug")
    .single<{ id: string; slug: string }>();

  if (listingError) {
    return NextResponse.json(
      { error: `Listing insert failed: ${listingError.message}` },
      { status: 500 },
    );
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

  const [subscription, activeListings] = await Promise.all([
    getLatestSubscriptionForHost(host.id),
    countActiveListingsForHost(host.id),
  ]);
  const entitlement = computeHostEntitlement(subscription, activeListings);

  const notice = entitlement.canActivateListing
    ? null
    : entitlement.effectiveAllowance === 0
      ? "Saved as a draft. Start a host plan to publish active listings."
      : "Saved as a draft. You are at your active-listing limit, so this can't go live until a slot frees up or you add capacity.";

  return NextResponse.json({
    ok: true,
    id: listing.id,
    slug: listing.slug,
    url: `/sweeps/${listing.slug}`,
    notice,
    quota: {
      status: entitlement.status,
      allowance: entitlement.effectiveAllowance,
      activeListings: entitlement.activeListingCount,
      remaining: entitlement.remainingActiveSlots,
    },
  });
}
