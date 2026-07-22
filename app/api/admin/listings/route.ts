import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { adminListingImportSchema } from "@/lib/admin-listing-schema";
import {
  CanonicalListingConflictError,
  createCanonicalListing,
} from "@/lib/db/canonical-listing-write";
import { revalidatePublicListings } from "@/lib/db/listings-cache";

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
      {
        error: parsed.error.issues[0]?.message ?? "Invalid listing payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const listing = await createCanonicalListing(parsed.data, {
      kind: "admin_official",
      actorAppUserId: authUser.appUserId,
      publish: parsed.data.publish,
      verified: parsed.data.verified,
    });
    if (listing.published) revalidatePublicListings();
    return NextResponse.json({
      ok: true,
      id: listing.id,
      slug: listing.slug,
      url: `/sweeps/${listing.slug}`,
    });
  } catch (error) {
    if (error instanceof CanonicalListingConflictError) {
      return NextResponse.json(
        { error: error.message, listingId: error.listingId },
        { status: 409 },
      );
    }
    Sentry.captureException(error, { tags: { source: "admin-listing-create" } });
    return NextResponse.json(
      { error: "Listing could not be created safely." },
      { status: 500 },
    );
  }
}
