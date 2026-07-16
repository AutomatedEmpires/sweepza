import { NextResponse } from "next/server";
import { getCachedListingBySlug } from "@/lib/db/listings-cache";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const listing = await getCachedListingBySlug(slug);

  if (!listing) {
    return NextResponse.json(
      { error: "Listing not found", slug },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: listing });
}
