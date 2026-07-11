import { describe, expect, it } from "vitest";
import {
  buildListingJsonLd,
  listingOgImagePath,
  listingPath,
  serializeJsonLd,
} from "@/lib/listing-seo";
import type { Listing } from "@/lib/types/listing";

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    slug: "test-sweep",
    title: "Test sweepstakes",
    shortDescription: "A public sweepstakes listing.",
    prizeName: "A useful prize",
    entryUrl: "https://example.com/enter",
    endDate: "2026-08-01T00:00:00.000Z",
    entryFrequency: "one_time",
    sourceLabel: "found_by_sweepza",
    lifecycleStatus: "active",
    listingVerificationStatus: "reviewed",
    ...overrides,
  };
}

describe("listing SEO helpers", () => {
  it("encodes slugs before placing them in public paths", () => {
    expect(listingPath("summer sweep/2026")).toBe(
      "/sweeps/summer%20sweep%2F2026",
    );
    expect(listingOgImagePath("summer sweep/2026")).toBe(
      "/api/og/sweeps/summer%20sweep%2F2026",
    );
  });

  it("uses truthful WebPage vocabulary instead of presenting a sweepstakes as an Event", () => {
    const jsonLd = buildListingJsonLd(
      makeListing({
        mainImageUrl: "https://example.com/prize.png",
        publishedAt: "2026-07-01T12:00:00.000Z",
      }),
      "https://sweepza.com/sweeps/test-sweep",
    );

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Test sweepstakes",
      url: "https://sweepza.com/sweeps/test-sweep",
      isPartOf: {
        "@type": "WebSite",
        name: "Sweepza",
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: "https://example.com/prize.png",
      },
      datePublished: "2026-07-01T12:00:00.000Z",
    });
    expect(jsonLd).not.toHaveProperty("offers");
  });

  it("neutralizes script-closing text before inline JSON-LD rendering", () => {
    const serialized = serializeJsonLd(
      buildListingJsonLd(
        makeListing({
          title: '</script><script>alert("stored-xss")</script>',
        }),
        "https://sweepza.com/sweeps/test-sweep",
      ),
    );

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
    expect(JSON.parse(serialized).name).toBe(
      '</script><script>alert("stored-xss")</script>',
    );
  });
});
