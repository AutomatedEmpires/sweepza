import { describe, expect, it } from "vitest";
import { SourceFetchError } from "@/lib/ingestion/source";
import {
  freebieGuyAdapter,
  isClosedPost,
  looksLikeSweepstakes,
  parseFreebieGuyArchive,
  parseFreebieGuyOfficialUrl,
} from "@/lib/ingestion/adapters/freebie-guy";
import { createFixtureHttpClient } from "@/lib/ingestion/fixtures/http";
import {
  FG_ARCHIVE_HTML,
  FG_POST_CLOSED_HTML,
  FG_POST_HTML,
} from "@/lib/ingestion/fixtures/scenarios";
import { getSourceDescriptor } from "@/lib/ingestion/source";

const descriptor = getSourceDescriptor("freebie_guy")!;

const PAGES = {
  "https://thefreebieguy.com/category/sweepstakes": { body: FG_ARCHIVE_HTML },
  "https://thefreebieguy.com/sweepstakes/win-a-year-of-coffee": { body: FG_POST_HTML },
  "https://thefreebieguy.com/sweepstakes/enter-to-win-a-grill": { body: FG_POST_CLOSED_HTML },
};

describe("looksLikeSweepstakes", () => {
  it("accepts posts on the sweepstakes path", () => {
    expect(looksLikeSweepstakes({ url: "https://thefreebieguy.com/sweepstakes/x", title: "Win a Grill" })).toBe(true);
  });

  it("rejects freebies and coupons", () => {
    expect(looksLikeSweepstakes({ url: "https://thefreebieguy.com/freebies/free-sample-box/", title: "Free Sample Box" })).toBe(false);
    expect(looksLikeSweepstakes({ url: "https://thefreebieguy.com/deals/coupon", title: "Printable Coupon" })).toBe(false);
  });

  it("keeps a sweepstakes even when its title sounds like a freebie", () => {
    // The path is the stronger signal: "Free Coffee Sweepstakes" is a sweepstakes.
    expect(
      looksLikeSweepstakes({
        url: "https://thefreebieguy.com/sweepstakes/free-coffee-sweepstakes/",
        title: "Free Coffee Sweepstakes",
      }),
    ).toBe(true);
  });

  it("requires positive evidence — a bare post is not assumed to be a sweepstakes", () => {
    expect(looksLikeSweepstakes({ url: "https://thefreebieguy.com/blog/hello", title: "Hello" })).toBe(false);
  });
});

describe("isClosedPost", () => {
  it("detects an ended giveaway", () => {
    expect(isClosedPost(FG_POST_CLOSED_HTML)).toBe(true);
  });
  it("does not flag a live post", () => {
    expect(isClosedPost(FG_POST_HTML)).toBe(false);
  });
});

describe("parseFreebieGuyArchive", () => {
  it("extracts posts with url and title", () => {
    const posts = parseFreebieGuyArchive(FG_ARCHIVE_HTML);
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({
      url: "https://thefreebieguy.com/sweepstakes/win-a-year-of-coffee",
      title: "Win a Year of Coffee Sweepstakes",
      publishedOn: "2026-07-15",
    });
  });
});

describe("parseFreebieGuyOfficialUrl", () => {
  it("returns the first off-site link in the content", () => {
    expect(parseFreebieGuyOfficialUrl(FG_POST_HTML)).toBe(
      "https://roasteddaily.example.com/year-of-coffee",
    );
  });

  it("ignores links back to the blog itself", () => {
    const html = `<div class="entry-content"><a href="https://thefreebieguy.com/about">About</a><a href="https://sponsor.example.com/enter">Enter</a></div>`;
    expect(parseFreebieGuyOfficialUrl(html)).toBe("https://sponsor.example.com/enter");
  });

  it("is not fooled by a lookalike host that only prefixes the blog domain", () => {
    // A string-prefix check would misclassify thefreebieguy.com.evil.example as
    // internal and skip it; a parsed-host check treats it as the external lead.
    const html = `<div class="entry-content"><a href="https://thefreebieguy.com.evil.example/phish">Enter</a></div>`;
    expect(parseFreebieGuyOfficialUrl(html)).toBe("https://thefreebieguy.com.evil.example/phish");
  });

  it("treats a real blog subdomain as internal", () => {
    const html = `<div class="entry-content"><a href="https://www.thefreebieguy.com/x">nav</a><a href="https://cdn.thefreebieguy.com/y">asset</a><a href="https://sponsor.example.com/enter">Enter</a></div>`;
    expect(parseFreebieGuyOfficialUrl(html)).toBe("https://sponsor.example.com/enter");
  });
});

describe("freebieGuyAdapter.discover", () => {
  it("filters to sweepstakes, skips the closed one, and yields the live lead", async () => {
    const http = createFixtureHttpClient(descriptor, PAGES);
    const leads = await freebieGuyAdapter.discover({ http, limit: 10 });

    // Archive has coffee (live), a freebie (filtered), and a grill (closed).
    expect(leads).toHaveLength(1);
    expect(leads[0].officialUrl).toBe("https://roasteddaily.example.com/year-of-coffee");
    expect(leads[0].sourceUrl).toBe("https://thefreebieguy.com/sweepstakes/win-a-year-of-coffee");
  });

  it("RAISES when the archive is unavailable — a down source is not a quiet day", async () => {
    // Was: `toEqual([])`. That assertion WAS the bug. Returning [] made a dead
    // source indistinguishable from "no new sweeps", so the orchestrator
    // recorded ok, reset consecutive_failures, and the circuit breaker could
    // never open for the outage it exists to contain.
    const http = createFixtureHttpClient(descriptor, {
      "https://thefreebieguy.com/category/sweepstakes": { networkError: "ECONNRESET" },
    });

    await expect(freebieGuyAdapter.discover({ http, limit: 10 })).rejects.toThrow(
      SourceFetchError,
    );
  });

  it("carries the failure class so the breaker can record WHY", async () => {
    const http = createFixtureHttpClient(descriptor, {
      "https://thefreebieguy.com/category/sweepstakes": { status: 503 },
    });

    await expect(freebieGuyAdapter.discover({ http, limit: 10 })).rejects.toMatchObject({
      name: "SourceFetchError",
      failure: "server_error",
    });
  });

  it("never leaves thefreebieguy.com during discovery", async () => {
    const log: string[] = [];
    const http = createFixtureHttpClient(descriptor, PAGES, { log });
    await freebieGuyAdapter.discover({ http, limit: 10 });
    for (const url of log) {
      expect(new URL(url).hostname).toBe("thefreebieguy.com");
    }
  });
});
