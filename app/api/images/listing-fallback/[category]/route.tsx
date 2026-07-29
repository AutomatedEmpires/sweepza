import { listingFallbackAssetUrl } from "@/lib/listing-media";

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  const location = new URL(listingFallbackAssetUrl(category), request.url);

  return new Response(null, {
    status: 307,
    headers: {
      Location: location.toString(),
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}
