import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, stripHtmlToText } from "@/lib/ingestion/html-text";

describe("decodeHtmlEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeHtmlEntities("Books &amp; Brews")).toBe("Books & Brews");
    expect(decodeHtmlEntities("21+ &quot;US&quot;")).toBe('21+ "US"');
    expect(decodeHtmlEntities("it&#39;s")).toBe("it's");
    expect(decodeHtmlEntities("&#x2019;")).toBe("’");
  });

  it("does NOT double-unescape — the vulnerability CodeQL flagged", () => {
    // The classic defect: `&amp;#39;` must decode exactly once to `&#39;`, never
    // twice to `'`. A separate `&amp;`→`&` then `&#39;`→`'` pass would wrongly
    // reconstruct the apostrophe the source escaped on purpose.
    expect(decodeHtmlEntities("&amp;#39;")).toBe("&#39;");
    expect(decodeHtmlEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
    expect(decodeHtmlEntities("a&amp;amp;b")).toBe("a&amp;b");
  });

  it("leaves unknown entities verbatim", () => {
    expect(decodeHtmlEntities("&bogus; &notreal;")).toBe("&bogus; &notreal;");
  });

  it("ignores out-of-range numeric code points", () => {
    expect(decodeHtmlEntities("&#0; &#9999999999;")).toBe("&#0; &#9999999999;");
  });
});

describe("stripHtmlToText", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtmlToText("<h2><a href='x'>Win a  Grill</a></h2>")).toBe("Win a Grill");
  });

  it("does not leak attributes containing a quoted greater-than sign", () => {
    expect(stripHtmlToText('<p title="1 > 0">Win</p>')).toBe("Win");
    expect(stripHtmlToText("<p title='1 > 0'>Win</p>")).toBe("Win");
    expect(stripHtmlToText('<script data-test="1 > 0">window.bad=1</script><p>Keep</p>')).toBe(
      "Keep",
    );
  });

  it("drops script/style blocks entirely", () => {
    expect(stripHtmlToText("<p>Keep</p><script>window.x=1</script><style>.a{}</style>")).toBe(
      "Keep",
    );
  });

  it("strips reconstructed tag sequences that survive a single pass", () => {
    expect(stripHtmlToText("<<b>b>bold<</b>/b>")).not.toContain("<");
  });

  it("decodes entities exactly once after stripping", () => {
    expect(stripHtmlToText("<span>Books &amp; Brews &amp;#39;n more</span>")).toBe(
      "Books & Brews &#39;n more",
    );
  });
});
