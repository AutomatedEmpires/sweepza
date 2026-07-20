import { describe, expect, it } from "vitest";
import { fetchOfficialPage, htmlToText } from "@/lib/ingestion/extract";
import { createFixtureHttpClient } from "@/lib/ingestion/fixtures/http";
import type { SourceDescriptor } from "@/lib/ingestion/source";

function officialDescriptor(overrides: Partial<SourceDescriptor> = {}): SourceDescriptor {
  return {
    id: "official_direct",
    label: "Sponsor official pages",
    tier: "official",
    homepage: "",
    allowedHosts: [],
    allowedPathPrefixes: [],
    crawlDelayMs: 0,
    requestBudgetPerRun: 50,
    maxConcurrency: 1,
    timeoutMs: 1000,
    refreshIntervalMinutes: 1440,
    supportsConditionalRequests: true,
    maxRetries: 0,
    failureThreshold: 5,
    complianceState: "reviewed",
    robotsPosture: "unknown",
    tosPosture: "unreviewed",
    attribution: null,
    dataRetentionDays: 365,
    killSwitch: false,
    buildPriority: 0,
    notes: "",
    ...overrides,
  };
}

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

describe("fetchOfficialPage", () => {
  it("reduces a fetched page to bounded text with a content hash", async () => {
    const http = createFixtureHttpClient(officialDescriptor(), {
      "https://sponsor.example.com/rules": {
        body: "<body><h1>Win a Trip</h1><p>Enter daily for a chance to win a getaway.</p></body>",
      },
    });
    const result = await fetchOfficialPage("https://sponsor.example.com/rules", http);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.page.text).toContain("Win a Trip");
      expect(result.page.contentHash).toMatch(/^[0-9a-f]{8}$/);
      expect(result.page.finalUrl).toBe("https://sponsor.example.com/rules");
      expect(result.page.fetchState.httpStatus).toBe(200);
    }
  });

  it("passes the transport failure class through for a dead link", async () => {
    const http = createFixtureHttpClient(officialDescriptor(), {
      "https://sponsor.example.com/gone": { status: 404 },
    });
    const result = await fetchOfficialPage("https://sponsor.example.com/gone", http);
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("not_found");
  });

  it("reports a not_modified page without a body", async () => {
    const http = createFixtureHttpClient(
      officialDescriptor(),
      {
        "https://sponsor.example.com/rules": {
          body: "<body><h1>Win a Trip</h1><p>Enter to win.</p></body>",
          headers: { etag: 'W/"v1"' },
        },
      },
      { honorConditional: true },
    );
    const result = await fetchOfficialPage("https://sponsor.example.com/rules", http, {
      etag: 'W/"v1"',
    });
    expect(result.status).toBe("not_modified");
  });

  it("treats a near-empty page as a failure, not a listing", async () => {
    const http = createFixtureHttpClient(officialDescriptor(), {
      "https://sponsor.example.com/thin": { body: "<body>hi</body>" },
    });
    const result = await fetchOfficialPage("https://sponsor.example.com/thin", http);
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("empty_body");
  });
});
