import { describe, expect, it } from "vitest";

import { discoverImageCandidates } from "@/lib/ingestion/image-candidates";
import { selectSourcePreviewImage } from "@/lib/ingestion/source-preview";

const PAGE = "https://sweeps.example.com/win-a-truck";

function discover(html: string) {
  return discoverImageCandidates(html, PAGE);
}

describe("selectSourcePreviewImage", () => {
  it("captures the source's og:image as an https preview with its host and alt", () => {
    const preview = selectSourcePreviewImage(
      discover(`
        <html><head>
          <meta property="og:image" content="https://cdn.sponsor.example/prize-hero.jpg">
          <meta property="og:image:alt" content="Win a brand-new adventure truck">
        </head><body><h1>Enter to win</h1></body></html>
      `),
    );
    expect(preview).not.toBeNull();
    expect(preview?.url).toBe("https://cdn.sponsor.example/prize-hero.jpg");
    expect(preview?.sourceDomain).toBe("cdn.sponsor.example");
    expect(preview?.altText).toBe("Win a brand-new adventure truck");
  });

  it("returns null when the only image is a sponsor logo (the flat art we avoid)", () => {
    const preview = selectSourcePreviewImage(
      discover(`
        <html><head>
          <meta property="og:image" content="https://cdn.sponsor.example/company-logo.png">
        </head><body></body></html>
      `),
    );
    expect(preview).toBeNull();
  });

  it("returns null when the page exposes no usable image (falls back to category art)", () => {
    const preview = selectSourcePreviewImage(
      discover(`<html><head><title>Sweepstakes</title></head><body><p>Enter now</p></body></html>`),
    );
    expect(preview).toBeNull();
  });

  it("never adopts an http image (it would be mixed-content blocked on the https listing)", () => {
    const preview = selectSourcePreviewImage(
      discover(`
        <html><head>
          <meta property="og:image" content="http://cdn.sponsor.example/prize.jpg">
        </head><body></body></html>
      `),
    );
    expect(preview).toBeNull();
  });

  it("skips an http candidate and still selects an https primary image", () => {
    const preview = selectSourcePreviewImage(
      discover(`
        <html><head>
          <meta property="og:image" content="http://insecure.example/grand-prize-giveaway-hero.jpg">
          <script type="application/ld+json">
            {"@type":"WebPage","image":{"@type":"ImageObject","url":"https://secure.example/prize.jpg","name":"Grand prize giveaway"}}
          </script>
        </head><body></body></html>
      `),
    );
    expect(preview?.url).toBe("https://secure.example/prize.jpg");
    expect(preview?.url.startsWith("https://")).toBe(true);
  });
});
