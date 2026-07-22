import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import {
  CanonicalListingConflictError,
  createCanonicalListing,
} from "@/lib/db/canonical-listing-write";
import { getHostByAppUserId } from "@/lib/db/hosts";
import { hostListingSubmissionSchema } from "@/lib/host-listing-schema";

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
      {
        error: parsed.error.issues[0]?.message ?? "Invalid listing payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const listing = await createCanonicalListing(parsed.data, {
      kind: "host_submission",
      actorAppUserId: authUser.appUserId,
      hostId: host.id,
    });
    return NextResponse.json({
      ok: true,
      id: listing.id,
      slug: listing.slug,
      url: "/host/listings",
    });
  } catch (error) {
    if (error instanceof CanonicalListingConflictError) {
      return NextResponse.json(
        {
          error:
            "This promotion already exists in Sweepza. Use the claim workflow instead of creating a duplicate.",
          listingId: error.listingId,
        },
        { status: 409 },
      );
    }
    Sentry.captureException(error, { tags: { source: "host-listing-create" } });
    return NextResponse.json(
      { error: "Listing submission could not be saved safely." },
      { status: 500 },
    );
  }
}
