import { describe, expect, it } from "vitest";
import {
  LISTING_FALLBACK_PRESENTATION_VERSION,
  isGeneratedListingFallbackUrl,
  listingMediaPresentationUrl,
} from "@/lib/listing-media";

describe("listing media presentation URLs", () => {
  it("serves persisted generated fallbacks through the current deployment", () => {
    expect(
      listingMediaPresentationUrl(
        "https://sweepza.com/api/images/listing-fallback/travel",
      ),
    ).toBe(
      `/api/images/listing-fallback/travel?v=${LISTING_FALLBACK_PRESENTATION_VERSION}`,
    );
    expect(
      listingMediaPresentationUrl("/api/images/listing-fallback/experiences"),
    ).toBe(
      `/api/images/listing-fallback/experiences?v=${LISTING_FALLBACK_PRESENTATION_VERSION}`,
    );
  });

  it("normalizes unknown generated categories and leaves real media untouched", () => {
    expect(
      listingMediaPresentationUrl(
        "https://sweepza.com/api/images/listing-fallback/not-real?old=1",
      ),
    ).toBe(
      `/api/images/listing-fallback/other?v=${LISTING_FALLBACK_PRESENTATION_VERSION}`,
    );
    expect(
      listingMediaPresentationUrl("https://cdn.example/prize.jpg"),
    ).toBe("https://cdn.example/prize.jpg");
    expect(listingMediaPresentationUrl(undefined)).toBeUndefined();
  });

  it("recognizes only the generated fallback route", () => {
    expect(
      isGeneratedListingFallbackUrl(
        "/api/images/listing-fallback/gift_cards",
      ),
    ).toBe(true);
    expect(isGeneratedListingFallbackUrl("/images/prize.jpg")).toBe(false);
    expect(isGeneratedListingFallbackUrl(undefined)).toBe(false);
  });
});
