import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawExtraction } from "@/lib/ingestion/mapper";

// runIngestion with every I/O boundary mocked; mapExtraction and
// verifyCandidate run for real, so these tests exercise the actual
// publishable hard gate between extraction and the review queue.
const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  extractOfficialPage: vi.fn(),
  snapshotOfficialRules: vi.fn(),
  enabledSources: vi.fn(),
  createIngestedListing: vi.fn(),
  findExistingListingId: vi.fn(),
  findIngestionByUrlKey: vi.fn(),
  finishIngestionRun: vi.fn(),
  recordProvenance: vi.fn(),
  startIngestionRun: vi.fn(),
  touchLastSeen: vi.fn(),
}));

vi.mock("@/lib/ingestion/adapters/sweeps-advantage", () => ({
  sweepsAdvantageAdapter: { discover: mocks.discover },
}));

vi.mock("@/lib/ingestion/source", () => ({
  enabledSources: mocks.enabledSources,
}));

vi.mock("@/lib/ingestion/extract", () => ({
  extractOfficialPage: mocks.extractOfficialPage,
}));

vi.mock("@/lib/ingestion/snapshot", () => ({
  snapshotOfficialRules: mocks.snapshotOfficialRules,
}));

vi.mock("@/lib/db/ingestion", () => ({
  createIngestedListing: mocks.createIngestedListing,
  findExistingListingId: mocks.findExistingListingId,
  findIngestionByUrlKey: mocks.findIngestionByUrlKey,
  finishIngestionRun: mocks.finishIngestionRun,
  recordProvenance: mocks.recordProvenance,
  startIngestionRun: mocks.startIngestionRun,
  touchLastSeen: mocks.touchLastSeen,
}));

import { runIngestion } from "@/lib/ingestion/orchestrator";

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

function raw(overrides: Partial<RawExtraction> = {}): RawExtraction {
  return {
    title: "Win a Dream Vacation",
    shortDescription: "Enter daily for a chance at a tropical getaway.",
    prizeName: "Tropical Vacation",
    prizeValue: "$10,000",
    prizeCategory: "Travel",
    entryUrl: "https://brand.com/enter",
    officialRulesUrl: "https://brand.com/official-rules",
    endDate: FUTURE,
    entryFrequency: "daily",
    eligibilityCountry: "United States",
    noPurchaseNecessary: "yes",
    sponsorName: "Brand, Inc.",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.enabledSources.mockReturnValue([
    { id: "sweeps_advantage", enabled: true },
  ]);
  mocks.discover.mockResolvedValue([
    { officialUrl: "https://brand.com/official-rules" },
  ]);
  mocks.extractOfficialPage.mockResolvedValue({
    raw: raw(),
    pageText: "page text",
    contentHash: "hash",
  });
  mocks.snapshotOfficialRules.mockResolvedValue("snapshot-ref");
  mocks.findExistingListingId.mockResolvedValue(null);
  mocks.findIngestionByUrlKey.mockResolvedValue(null);
  mocks.startIngestionRun.mockResolvedValue("run-1");
  mocks.createIngestedListing.mockResolvedValue("listing-1");
  mocks.finishIngestionRun.mockResolvedValue(undefined);
  mocks.recordProvenance.mockResolvedValue(undefined);
});

describe("runIngestion publishable gate", () => {
  it("creates a draft for a candidate that passes every hard check", async () => {
    const summaries = await runIngestion();
    expect(mocks.createIngestedListing).toHaveBeenCalledTimes(1);
    expect(mocks.recordProvenance).toHaveBeenCalledTimes(1);
    expect(summaries).toEqual([
      expect.objectContaining({
        source: "sweeps_advantage",
        status: "ok",
        created: 1,
        failed: 0,
      }),
    ]);
    // No held reasons ⇒ no notes.
    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      "run-1",
      expect.anything(),
      "ok",
      undefined,
    );
  });

  it("holds a candidate that fails a hard check — no draft row, reasons in run notes", async () => {
    // Missing no-purchase signal AND missing rules URL: both are hard gates.
    mocks.extractOfficialPage.mockResolvedValue({
      raw: raw({ noPurchaseNecessary: null, officialRulesUrl: null }),
      pageText: "page text",
      contentHash: "hash",
    });

    const summaries = await runIngestion();
    expect(mocks.createIngestedListing).not.toHaveBeenCalled();
    expect(mocks.recordProvenance).not.toHaveBeenCalled();
    expect(summaries).toEqual([
      expect.objectContaining({ status: "ok", created: 0, failed: 1 }),
    ]);

    const notes = mocks.finishIngestionRun.mock.calls[0][3];
    expect(notes).toContain("held:");
    expect(notes).toContain("no_purchase_necessary");
    expect(notes).toContain("has_official_rules_url");
  });

  it("holds a candidate whose end date has passed", async () => {
    mocks.extractOfficialPage.mockResolvedValue({
      raw: raw({ endDate: "2020-01-01" }),
      pageText: "page text",
      contentHash: "hash",
    });

    await runIngestion();
    expect(mocks.createIngestedListing).not.toHaveBeenCalled();
    const notes = mocks.finishIngestionRun.mock.calls[0][3];
    expect(notes).toContain("end_date_in_future");
  });

  it("routes substance failures (empty title/description) through the same hold path", async () => {
    // These used to short-circuit on a separate NOT NULL guard that never
    // reported reasons; they must land in the run notes like any hard failure.
    mocks.extractOfficialPage.mockResolvedValue({
      raw: raw({ title: "", shortDescription: "" }),
      pageText: "page text",
      contentHash: "hash",
    });

    const summaries = await runIngestion();
    expect(mocks.createIngestedListing).not.toHaveBeenCalled();
    // Held before dedupe — no catalog lookup for a candidate we won't create.
    expect(mocks.findExistingListingId).not.toHaveBeenCalled();
    expect(summaries).toEqual([
      expect.objectContaining({ status: "ok", created: 0, failed: 1 }),
    ]);
    const notes = mocks.finishIngestionRun.mock.calls[0][3];
    expect(notes).toContain("has_title");
    expect(notes).toContain("has_short_description");
  });
});
