import { describe, expect, it } from "vitest";
import {
  isGeneratedListingFallbackUrl,
  listingFallbackAltText,
  listingFallbackAssetUrl,
  listingMediaPresentationUrl,
  normalizeFallbackCategory,
} from "@/lib/listing-media";

function ownedAsset(name: string): string {
  return `/images/listing-fallbacks/${name}`;
}

describe("listing media presentation URLs", () => {
  it("serves persisted generated fallbacks through the current deployment", () => {
    expect(
      listingMediaPresentationUrl(
        "https://sweepza.com/api/images/listing-fallback/travel",
      ),
    ).toBe(ownedAsset("travel.webp"));
    expect(
      listingMediaPresentationUrl("/api/images/listing-fallback/experiences"),
    ).toBe(ownedAsset("travel.webp"));
    expect(
      listingMediaPresentationUrl(
        "https://sweepza.com/opengraph-image",
        "Travel",
      ),
    ).toBe(ownedAsset("travel.webp"));
  });

  it("normalizes unknown generated categories and leaves real media untouched", () => {
    expect(
      listingMediaPresentationUrl(
        "https://sweepza.com/api/images/listing-fallback/not-real?old=1",
      ),
    ).toBe(ownedAsset("general-prize.webp"));
    expect(
      listingMediaPresentationUrl("https://cdn.example/prize.jpg"),
    ).toBe("https://cdn.example/prize.jpg");
    expect(
      listingMediaPresentationUrl(
        "https://cdn.example/api/images/listing-fallback/cash",
      ),
    ).toBe("https://cdn.example/api/images/listing-fallback/cash");
    expect(listingMediaPresentationUrl(undefined)).toBeUndefined();
  });

  it("recognizes only the generated fallback route", () => {
    expect(
      isGeneratedListingFallbackUrl(
        "/api/images/listing-fallback/gift_cards",
      ),
    ).toBe(true);
    expect(
      isGeneratedListingFallbackUrl(
        "/images/listing-fallbacks/electronics.webp",
      ),
    ).toBe(true);
    expect(isGeneratedListingFallbackUrl("/images/prize.jpg")).toBe(false);
    expect(
      isGeneratedListingFallbackUrl(
        "https://sweepza.com/opengraph-image",
      ),
    ).toBe(true);
    expect(
      isGeneratedListingFallbackUrl(
        "https://example.com/opengraph-image",
      ),
    ).toBe(false);
    expect(
      isGeneratedListingFallbackUrl(
        "https://cdn.example/api/images/listing-fallback/cash",
      ),
    ).toBe(false);
    expect(
      isGeneratedListingFallbackUrl(
        "https://cdn.example/images/listing-fallbacks/electronics.webp",
      ),
    ).toBe(false);
    expect(isGeneratedListingFallbackUrl(undefined)).toBe(false);
  });

  it.each([
    ["cash", "cash-gift-card.webp"],
    ["gift_cards", "general-prize.webp"],
    ["travel", "travel.webp"],
    ["experiences", "travel.webp"],
    ["electronics", "electronics.webp"],
    ["vehicles", "general-prize.webp"],
    ["outdoor", "general-prize.webp"],
    ["home", "general-prize.webp"],
    ["food_beverage", "general-prize.webp"],
    ["fashion_beauty", "general-prize.webp"],
    ["family_kids", "general-prize.webp"],
    ["seasonal", "general-prize.webp"],
    ["other", "general-prize.webp"],
    ["not-real", "general-prize.webp"],
  ])("routes %s to the owned %s asset", (category, assetName) => {
    expect(listingFallbackAssetUrl(category)).toBe(ownedAsset(assetName));
  });

  it("normalizes display categories before selecting an owned asset", () => {
    expect(listingFallbackAssetUrl("Gift Cards")).toBe(
      ownedAsset("general-prize.webp"),
    );
    expect(listingFallbackAssetUrl("Electronics")).toBe(
      ownedAsset("electronics.webp"),
    );
    expect(listingFallbackAssetUrl("Home Goods")).toBe(
      ownedAsset("general-prize.webp"),
    );
  });

  it("describes owned media as representative rather than official", () => {
    expect(listingFallbackAltText("Electronics")).toBe(
      "Representative photo for tech prize listings; not the official promotion image.",
    );
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "rejects inherited object key %s as an unknown category",
    (category) => {
      expect(normalizeFallbackCategory(category)).toBe("other");
      expect(listingFallbackAssetUrl(category)).toBe(
        ownedAsset("general-prize.webp"),
      );
      expect(() => listingFallbackAltText(category)).not.toThrow();
      expect(listingFallbackAltText(category)).toBe(
        "Representative photo for prize giveaway listings; not the official promotion image.",
      );
    },
  );
});

describe("listing fallback image route", () => {
  it("redirects generated category URLs to the matching local asset", async () => {
    const { GET } = await import(
      "@/app/api/images/listing-fallback/[category]/route"
    );
    const response = await GET(
      new Request(
        "https://sweepza.test/api/images/listing-fallback/gift_cards",
      ),
      { params: Promise.resolve({ category: "gift_cards" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://sweepza.test${ownedAsset("general-prize.webp")}`,
    );
    expect(response.headers.get("cache-control")).toContain(
      "s-maxage=31536000",
    );
  });

  it("redirects inherited object keys to the neutral owned asset", async () => {
    const { GET } = await import(
      "@/app/api/images/listing-fallback/[category]/route"
    );
    const response = await GET(
      new Request(
        "https://sweepza.test/api/images/listing-fallback/constructor",
      ),
      { params: Promise.resolve({ category: "constructor" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://sweepza.test${ownedAsset("general-prize.webp")}`,
    );
  });
});
