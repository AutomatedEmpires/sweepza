import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { WinnerCard } from "@/components/winner-card";
import type { Listing } from "@/lib/types/listing";
import type { WinnerPost } from "@/lib/types/winner";

const post: WinnerPost = {
  id: "winner-1",
  winnerDisplayName: "Taylor",
  caption: "I won a trip.",
  listingSlug: "travel-prize",
  listingTitle: "Travel prize",
  verifiedWin: true,
  reviewStatus: "draft",
  reactions: {},
  createdAt: "2026-07-01T12:00:00.000Z",
};

const listing: Listing = {
  id: "listing-1",
  slug: "travel-prize",
  title: "Travel prize",
  shortDescription: "An official-source sweepstakes listing.",
  prizeName: "Vacation package",
  prizeCategory: "Travel",
  imageAltText: "Official sponsor photo of the vacation package",
  categoryFallbackImageUrl: "/api/images/listing-fallback/travel",
  entryUrl: "https://sponsor.example/enter",
  endDate: "2099-12-31T23:59:59.000Z",
  entryFrequency: "one_time",
  sourceLabel: "found_by_sweepza",
  lifecycleStatus: "active",
  listingVerificationStatus: "reviewed",
};

describe("WinnerCard media truth", () => {
  it("labels category fallback art and never attributes it to the member or sponsor", () => {
    const html = renderToStaticMarkup(
      <WinnerCard post={post} listing={listing} />,
    );

    expect(html).toContain("Representative photo");
    expect(html).toContain(
      'alt="Representative photo for travel prize listings; not the official promotion image."',
    );
    expect(html).toContain("/images/listing-fallbacks/travel.webp");
    expect(html).not.toContain(
      'alt="Official sponsor photo of the vacation package"',
    );
    expect(html).not.toContain(
      'alt="Photo shared by Taylor with their winner story"',
    );
  });
});
