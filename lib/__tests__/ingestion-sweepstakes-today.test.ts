import { describe, expect, it } from "vitest";
import {
  parseSweepstakesTodayIndex,
  parseSweepstakesTodayOfficialUrl,
  sweepstakesTodayAdapter,
} from "@/lib/ingestion/adapters/sweepstakes-today";
import { createFixtureHttpClient } from "@/lib/ingestion/fixtures/http";
import {
  ST_DETAIL_BROKEN_LINK_HTML,
  ST_DETAIL_GEO_HTML,
  ST_DETAIL_HTML,
  ST_INDEX_EMPTY_HTML,
  ST_INDEX_HTML,
  INVALID_PAGE_HTML,
} from "@/lib/ingestion/fixtures/scenarios";
import { getSourceDescriptor } from "@/lib/ingestion/source";

const descriptor = getSourceDescriptor("sweepstakes_today")!;

const PAGES = {
  "https://www.sweepstakestoday.com/listings": { body: ST_INDEX_HTML },
  "https://www.sweepstakestoday.com/sweepstakes/win-a-kitchen-makeover-88213.html": {
    body: ST_DETAIL_HTML,
  },
  "https://www.sweepstakestoday.com/sweepstakes/summer-road-trip-cash-88214.html": {
    body: ST_DETAIL_BROKEN_LINK_HTML,
  },
  "https://www.sweepstakestoday.com/sweepstakes/canada-only-cabin-getaway-88215.html": {
    body: ST_DETAIL_GEO_HTML,
  },
};

describe("parseSweepstakesTodayIndex", () => {
  it("extracts one row per listing with its hints", () => {
    const rows = parseSweepstakesTodayIndex(ST_INDEX_HTML);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      detailPath: "/sweepstakes/win-a-kitchen-makeover-88213.html",
      title: "Win a Kitchen Makeover",
      hintEndDate: "2026-09-01",
      hintFrequency: "Daily",
    });
  });

  it("returns nothing for an index with no detail links", () => {
    expect(parseSweepstakesTodayIndex(ST_INDEX_EMPTY_HTML)).toEqual([]);
  });

  it("returns nothing for a page that is not an index at all", () => {
    expect(parseSweepstakesTodayIndex(INVALID_PAGE_HTML)).toEqual([]);
  });
});

describe("parseSweepstakesTodayOfficialUrl", () => {
  it("prefers the rules link over the entry button", () => {
    expect(parseSweepstakesTodayOfficialUrl(ST_DETAIL_HTML)).toBe(
      "https://northwind-appliances.example.com/kitchen-sweeps/official-rules",
    );
  });

  it("falls back to the entry link when no rules link exists", () => {
    const html = `<div><a class="enter-btn" href="https://sponsor.example.com/enter?utm_source=st">Enter</a></div>`;
    // utm_ params are identity noise and must not survive into the key.
    expect(parseSweepstakesTodayOfficialUrl(html)).toBe("https://sponsor.example.com/enter");
  });

  it("returns null for a broken official link rather than inventing one", () => {
    expect(parseSweepstakesTodayOfficialUrl(ST_DETAIL_BROKEN_LINK_HTML)).toBeNull();
  });
});

describe("sweepstakesTodayAdapter.discover", () => {
  it("yields a lead per resolvable listing and drops the broken one", async () => {
    const http = createFixtureHttpClient(descriptor, PAGES);
    const leads = await sweepstakesTodayAdapter.discover({ http, limit: 10 });

    expect(leads).toHaveLength(2);
    expect(leads.map((l) => l.officialUrl)).toEqual([
      "https://northwind-appliances.example.com/kitchen-sweeps/official-rules",
      "https://laurentide-cabins.example.com/cabin-getaway/rules",
    ]);
    // Provenance points back at the discovery page, never at the sponsor.
    expect(leads[0].sourceUrl).toBe(
      "https://www.sweepstakestoday.com/sweepstakes/win-a-kitchen-makeover-88213.html",
    );
  });

  it("carries the geo-restricted listing through — eligibility is decided at the official page", async () => {
    const http = createFixtureHttpClient(descriptor, PAGES);
    const leads = await sweepstakesTodayAdapter.discover({ http, limit: 10 });
    // A Canada-only sweep is a real sweep; discovery must not silently drop it.
    expect(leads.some((l) => l.officialUrl.includes("laurentide-cabins"))).toBe(true);
  });

  it("honors the limit", async () => {
    const http = createFixtureHttpClient(descriptor, PAGES);
    const leads = await sweepstakesTodayAdapter.discover({ http, limit: 1 });
    expect(leads).toHaveLength(1);
  });

  it("returns nothing when the index is unavailable", async () => {
    const http = createFixtureHttpClient(descriptor, {
      "https://www.sweepstakestoday.com/listings": { status: 503 },
    });
    expect(await sweepstakesTodayAdapter.discover({ http, limit: 10 })).toEqual([]);
  });

  it("returns nothing — not garbage — when the layout changes", async () => {
    const http = createFixtureHttpClient(descriptor, {
      "https://www.sweepstakestoday.com/listings": { body: INVALID_PAGE_HTML },
    });
    expect(await sweepstakesTodayAdapter.discover({ http, limit: 10 })).toEqual([]);
  });

  it("stays inside its declared reach", async () => {
    const log: string[] = [];
    const http = createFixtureHttpClient(descriptor, PAGES, { log });
    await sweepstakesTodayAdapter.discover({ http, limit: 10 });

    for (const url of log) {
      expect(new URL(url).hostname).toBe("www.sweepstakestoday.com");
    }
  });
});
