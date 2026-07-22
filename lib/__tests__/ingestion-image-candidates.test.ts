import { describe, expect, it } from "vitest";
import { discoverImageCandidates } from "@/lib/ingestion/image-candidates";

const PAGE = "https://sponsor.example.com/promotions/summer-sweepstakes";

describe("discoverImageCandidates", () => {
  it("prioritizes a CC0 JSON-LD image and resolves a relative URL", () => {
    const result = discoverImageCandidates(`
      <script type="application/ld+json">
        {
          "@type":"Article",
          "headline":"Summer travel sweepstakes",
          "license":"https://creativecommons.org/publicdomain/zero/1.0/",
          "creditText":"Sponsor Media Team",
          "image":{"url":"/media/grand-prize.jpg","width":1600,"height":900,"caption":"Grand prize vacation"}
        }
      </script>
    `, PAGE);

    expect(result.candidates[0]).toMatchObject({
      url: "https://sponsor.example.com/media/grand-prize.jpg",
      method: "json_ld",
      widthHint: 1600,
      heightHint: 900,
      rights: {
        status: "permitted",
        attribution: "Sponsor Media Team",
      },
    });
  });

  it.each([
    "https://creativecommons.org/licenses/by/4.0/",
    "https://creativecommons.org/licenses/by-sa/4.0/",
  ])("does not auto-permit attribution-required license %s", (license) => {
    const result = discoverImageCandidates(`
      <script type="application/ld+json">
        {
          "@type":"Article",
          "headline":"Summer sweepstakes grand prize",
          "license":"${license}",
          "creditText":"Sponsor Media Team",
          "image":{"url":"/media/prize.jpg","width":1600,"height":900}
        }
      </script>
    `, PAGE);

    expect(result.candidates[0].rights).toMatchObject({
      status: "restricted",
      licenseUrl: license,
      reason: "attribution-required licenses are not eligible until Sweepza publishes the required license notice",
    });
  });

  it("lets restrictive page evidence override a public-domain declaration", () => {
    const result = discoverImageCandidates(`
      <link rel="license" href="https://creativecommons.org/publicdomain/zero/1.0/">
      <meta name="rights" content="All rights reserved. Permission required for reuse.">
      <meta property="og:image" content="/prize.jpg">
      <meta property="og:image:alt" content="Sweepstakes grand prize">
    `, PAGE);

    expect(result.candidates[0].rights).toMatchObject({
      status: "restricted",
      reason: "page rights text does not permit automatic Sweepza reuse",
    });
  });

  it("lets an attribution-required rights notice override a CC0 page link", () => {
    const result = discoverImageCandidates(`
      <link rel="license" href="https://creativecommons.org/publicdomain/zero/1.0/">
      <meta name="rights" content="Image licensed CC BY-SA 4.0">
      <meta property="og:image" content="/prize.jpg">
      <meta property="og:image:alt" content="Sweepstakes grand prize">
    `, PAGE);

    expect(result.candidates[0].rights).toMatchObject({
      status: "restricted",
      reason: "attribution-required licenses are not eligible until Sweepza publishes the required license notice",
    });
  });

  it("retains restrictive rights when duplicate declarations conflict", () => {
    const result = discoverImageCandidates(`
      <script type="application/ld+json">
        [
          {
            "@type":"Article",
            "headline":"Summer sweepstakes grand prize",
            "license":"https://creativecommons.org/publicdomain/zero/1.0/",
            "image":{"url":"/same-prize.jpg","width":1600,"height":900}
          },
          {
            "@type":"Article",
            "headline":"Summer sweepstakes grand prize",
            "copyrightNotice":"All rights reserved",
            "image":{"url":"/same-prize.jpg","width":1600,"height":900}
          }
        ]
      </script>
    `, PAGE);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].rights.status).toBe("restricted");
  });

  it("groups Open Graph dimensions and alt text with the declared image", () => {
    const result = discoverImageCandidates(`
      <meta property="og:image" content="https://cdn.example.com/prize.webp">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta property="og:image:alt" content="Win the grand prize travel package">
    `, PAGE);

    expect(result.candidates[0]).toMatchObject({
      method: "open_graph",
      url: "https://cdn.example.com/prize.webp",
      widthHint: 1200,
      heightHint: 630,
      altText: "Win the grand prize travel package",
    });
  });

  it("discovers Twitter card imagery", () => {
    const result = discoverImageCandidates(`
      <meta name="twitter:image" content="//cdn.example.com/giveaway-card.jpg">
      <meta name="twitter:image:alt" content="Giveaway prize bundle">
    `, PAGE);

    expect(result.candidates[0]).toMatchObject({
      method: "twitter_card",
      url: "https://cdn.example.com/giveaway-card.jpg",
    });
  });

  it("selects the largest srcset candidate, lazy images, and CSS hero backgrounds", () => {
    const result = discoverImageCandidates(`
      <main>
        <picture class="grand-prize hero">
          <source srcset="/small.jpg 480w, /large.jpg 1440w">
          <img data-lazy-src="/lazy-prize.jpg" alt="Contest grand prize" width="1440" height="810">
        </picture>
        <section class="giveaway hero" style="background-image:url('/background-prize.webp')">Win a vacation</section>
      </main>
    `, PAGE);

    expect(result.candidates.map((candidate) => candidate.url)).toEqual(expect.arrayContaining([
      "https://sponsor.example.com/large.jpg",
      "https://sponsor.example.com/lazy-prize.jpg",
      "https://sponsor.example.com/background-prize.webp",
    ]));
    expect(result.candidates.some((candidate) => candidate.method === "responsive_srcset")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.method === "lazy_loaded")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.method === "css_background")).toBe(true);
  });

  it("rejects tracking pixels, placeholders, icons, and tiny assets", () => {
    const result = discoverImageCandidates(`
      <img src="/tracking-pixel.gif" width="1" height="1">
      <img src="/cookie-icon.svg" width="48" height="48">
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP" width="1" height="1">
      <img src="/placeholder.jpg" width="1200" height="630">
      <img src="/grand-prize.jpg" alt="Win the grand prize" width="1200" height="630">
    `, PAGE);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].url).toBe("https://sponsor.example.com/grand-prize.jpg");
    expect(result.rejected.flatMap((candidate) => candidate.reasons)).toEqual(expect.arrayContaining([
      "dimensions_too_small",
      "irrelevant_or_tracking_asset",
      "placeholder_asset",
      "unusable_or_non_http_url",
    ]));
  });

  it("rejects a large ordinary DOM image without hero or promotion context", () => {
    const result = discoverImageCandidates(`
      <article>
        <h2>Travel inspiration</h2>
        <img src="/editorial-travel.jpg" alt="A scenic mountain landscape" width="1600" height="900">
      </article>
    `, PAGE);

    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toContainEqual(expect.objectContaining({
      url: "https://sponsor.example.com/editorial-travel.jpg",
      reasons: expect.arrayContaining(["insufficient_promotion_context"]),
    }));
  });

  it("accepts a DOM image with explicit promotion context as a hero", () => {
    const result = discoverImageCandidates(`
      <main>
        <img src="/summer-entry.jpg" alt="Enter the summer sweepstakes to win the grand prize" width="1600" height="900">
      </main>
    `, PAGE);

    expect(result.candidates[0]).toMatchObject({
      url: "https://sponsor.example.com/summer-entry.jpg",
      method: "dom_hero",
      role: "primary",
    });
  });

  it("keeps a sufficiently large sponsor logo as a lower-priority fallback", () => {
    const result = discoverImageCandidates(`
      <header><img src="/brand/sponsor-logo.png" alt="Acme sponsor logo" width="600" height="240"></header>
    `, PAGE);

    expect(result.candidates[0]).toMatchObject({
      role: "sponsor_logo",
      method: "sponsor_asset",
    });
  });

  it("deduplicates identical URLs and retains the highest-confidence method", () => {
    const result = discoverImageCandidates(`
      <meta property="og:image" content="/same.jpg">
      <main><img src="/same.jpg" alt="Grand prize sweepstakes" width="1200" height="630"></main>
    `, PAGE);

    expect(result.candidates.filter((candidate) => candidate.url.endsWith("/same.jpg"))).toHaveLength(1);
    expect(result.candidates[0].method).toBe("open_graph");
  });

  it("does not mistake CORS or a source URL for reuse permission", () => {
    const result = discoverImageCandidates(`
      <meta property="og:image" content="https://images.publisher.example/prize.jpg">
    `, PAGE);

    expect(result.candidates[0].rights).toMatchObject({
      status: "unknown",
      reason: "no reusable image license or host authorization was found",
    });
  });
});
