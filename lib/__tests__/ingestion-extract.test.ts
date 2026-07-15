import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/ingestion/extract";

describe("htmlToText", () => {
  it("strips scripts, styles, and head, keeping visible copy", () => {
    const html = `
      <head><title>ignored</title><meta name="x" content="y"></head>
      <style>.a{color:red}</style>
      <script>window.x = 1;</script>
      <body><h1>Win a Trip</h1><p>Enter daily for a chance to win.</p></body>`;
    const text = htmlToText(html);
    expect(text).toContain("Win a Trip");
    expect(text).toContain("Enter daily for a chance to win.");
    expect(text).not.toContain("window.x");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("ignored");
  });

  it("decodes common entities and collapses whitespace", () => {
    const html = "<p>Books   &amp;   Brews &#8212; 21+ &quot;US&quot;</p>";
    const text = htmlToText(html);
    expect(text).toContain("Books & Brews");
    expect(text).toContain('"US"');
    expect(text).not.toMatch(/\s{3,}/);
  });

  it("turns block boundaries into line breaks", () => {
    const text = htmlToText("<p>Line one</p><p>Line two</p>");
    expect(text).toBe("Line one\nLine two");
  });

  it("caps very long input", () => {
    const text = htmlToText(`<p>${"x".repeat(50_000)}</p>`);
    expect(text.length).toBeLessThanOrEqual(14_000);
  });

  it("returns empty string for tag-only markup", () => {
    expect(htmlToText("<div><span></span></div>")).toBe("");
  });
});
