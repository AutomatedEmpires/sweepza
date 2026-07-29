import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingCard } from "@/components/listing-card";
import { ListingMedia } from "@/components/listing-media";
import type { Listing } from "@/lib/types/listing";

const requiredProps = {
  prizeName: "A listed prize",
  category: "Travel",
  sizes: "320px",
};

const cardListing: Listing = {
  id: "listing-media-card",
  slug: "travel-prize",
  title: "Travel prize",
  shortDescription: "An official-source sweepstakes listing",
  prizeName: "Vacation package",
  prizeValue: 500,
  prizeCurrency: "USD",
  prizeCategory: "Travel",
  categoryFallbackImageUrl: "/api/images/listing-fallback/travel",
  entryUrl: "https://sponsor.example/enter",
  endDate: "2099-12-31",
  entryFrequency: "one_time",
  sourceLabel: "found_by_sweepza",
  lifecycleStatus: "active",
  listingVerificationStatus: "reviewed",
};

describe("ListingMedia representative-photo disclosure", () => {
  it("labels generated fallback media visibly and with honest alt text", () => {
    const html = renderToStaticMarkup(
      <ListingMedia
        {...requiredProps}
        sourceUrl="/api/images/listing-fallback/travel"
        altText="Official beachfront vacation package"
      />,
    );

    expect(html).toContain("Representative photo");
    expect(html).toContain(
      'alt="Representative photo for travel prize listings; not the official promotion image."',
    );
    expect(html).not.toContain(
      'alt="Official beachfront vacation package"',
    );
    expect(html).toContain('style="position:absolute;inset:0"');
  });

  it("uses an owned representative photo when listing media is absent", () => {
    const html = renderToStaticMarkup(<ListingMedia {...requiredProps} />);

    expect(html).toContain(
      "/images/listing-fallbacks/travel.webp",
    );
    expect(html).toContain("Representative photo");
  });

  it("preserves official alt text and attribution for external media", () => {
    const html = renderToStaticMarkup(
      <ListingMedia
        {...requiredProps}
        sourceUrl="https://cdn.example/official-prize.webp"
        altText="Official sponsor photo of the vacation package"
        attribution="Example Sponsor"
      />,
    );

    expect(html).toContain(
      'alt="Official sponsor photo of the vacation package"',
    );
    expect(html).toContain("Image: Example Sponsor");
    expect(html).not.toContain("Representative photo");
  });

  it("discloses an explicitly representative external image", () => {
    const html = renderToStaticMarkup(
      <ListingMedia
        {...requiredProps}
        sourceUrl="https://cdn.example/category-travel.webp"
        altText="Official beachfront vacation package"
        representative
      />,
    );

    expect(html).toContain("Representative photo");
    expect(html).toContain(
      'alt="Representative photo for travel prize listings; not the official promotion image."',
    );
    expect(html).not.toContain(
      'alt="Official beachfront vacation package"',
    );
    expect(html).toContain(
      'src="https://cdn.example/category-travel.webp"',
    );
    expect(html).not.toContain("/images/listing-fallbacks/travel.webp");
  });

  it("keeps card disclosure clear of the save control and renders the value once", () => {
    const html = renderToStaticMarkup(
      <ListingCard listing={cardListing} />,
    );

    expect(html).toContain("Representative photo");
    expect(html).toContain("absolute left-2 z-10");
    expect(html).toContain('aria-label="Save Travel prize"');
    expect(html).toContain("absolute right-4 top-4");
    expect(html.match(/\$500/g)).toHaveLength(1);
    expect(html).not.toContain("bg-pine/8");
    expect(html).not.toContain("bg-pine/12");
  });

  it("keeps official attribution and every known eligibility fact in the standard card", () => {
    const html = renderToStaticMarkup(
      <ListingCard
        listing={{
          ...cardListing,
          mainImageUrl: "https://cdn.example/official-prize.webp",
          imageAttribution: "Example Sponsor",
          eligibilityCountry: "US",
          eligibilityStates: ["CA", "NV"],
          ageRequirement: 18,
          noPurchaseNecessary: true,
          entryLimitNotes: "One entry per household",
        }}
      />,
    );

    expect(html).toContain("Image: Example Sponsor");
    expect(html).toContain("Found by Sweepza");
    expect(html).toContain("US — CA, NV");
    expect(html).toContain("18+");
    expect(html).toContain("Confirmed");
    expect(html).toContain("One entry per household");
  });
});
