import { NextResponse } from "next/server";
import { getListingBySlug } from "@/lib/db/listings";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const listing = await getListingBySlug(slug);

  if (!listing) {
    return NextResponse.json(
      { error: "Listing not found", slug },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: listing });
}
