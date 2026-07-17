import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawExtraction } from "@/lib/ingestion/mapper";
import { SourceFetchError } from "@/lib/ingestion/source";

// runIngestion with every I/O boundary mocked; mapExtraction and
// verifyCandidate run for real, so these tests exercise the actual
// publishable hard gate between extraction and the review queue.
const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  extractOfficialPage: vi.fn(),
  snapshotOfficialRules: vi.fn(),
  createIngestedListing: vi.fn(),
  findExistingListingId: vi.fn(),
  findIngestionByUrlKey: vi.fn(),
  finishIngestionRun: vi.fn(),
  recordProvenance: vi.fn(),
  startIngestionRun: vi.fn(),
  touchLastSeen: vi.fn(),
  getSourceRecord: vi.fn(),
  recordRunOutcome: vi.fn(),
}));

// A source that satisfies every gate condition, so these tests exercise the
// PUBLISHABLE gate rather than re-testing the execution gate (which owns its
// own suite). Both discovery and official_direct must clear it: the orchestrator
// gates official fetching independently, so approving the discoverer alone
// correctly yields no run at all.
const approvedSource = vi.hoisted(() => (id: string, tier: "discovery" | "official") => ({
  id,
  label: id,
  tier,
  homepage: "https://example.com/",
  allowedHosts: tier === "official" ? [] : ["example.com"],
  allowedPathPrefixes: [],
  crawlDelayMs: 0,
  requestBudgetPerRun: 50,
  maxConcurrency: 1,
  timeoutMs: 1000,
  refreshIntervalMinutes: 720,
  supportsConditionalRequests: true,
  maxRetries: 1,
  failureThreshold: 3,
  complianceState: "approved_for_production" as const,
  robotsPosture: "permissive" as const,
  tosPosture: "permits_use" as const,
  attribution: null,
  dataRetentionDays: 90,
  killSwitch: false,
  buildPriority: 1,
  notes: "",
}));

vi.mock("@/lib/ingestion/adapters/sweeps-advantage", () => ({
  sweepsAdvantageAdapter: { discover: mocks.discover },
}));

vi.mock("@/lib/env", () => ({
  env: { INGESTION_ENABLED: "true", ANTHROPIC_API_KEY: "test" },
}));

// importActual, not a bare object: this module also exports SourceFetchError,
// which the orchestrator and these tests both need to be the REAL class —
// a replaced module would hand back undefined and every instanceof would lie.
vi.mock("@/lib/ingestion/source", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ingestion/source")>();
  return {
    ...actual,
    SOURCE_REGISTRY: [approvedSource("sweeps_advantage", "discovery")],
    getSourceDescriptor: (id: string) =>
      id === "official_direct"
        ? approvedSource("official_direct", "official")
        : approvedSource(id, "discovery"),
  };
});

vi.mock("@/lib/db/source-registry", () => ({
  getSourceRecord: mocks.getSourceRecord,
  recordRunOutcome: mocks.recordRunOutcome,
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
  vi.clearAllMocks();
  // An approval record for whichever source the gate asks about — both the
  // discoverer and official_direct are consulted, independently.
  mocks.getSourceRecord.mockImplementation(async (id: string) => ({
    id,
    complianceState: "approved_for_production",
    killSwitch: false,
    circuitOpenedAt: null,
  }));
  mocks.recordRunOutcome.mockResolvedValue(undefined);
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

describe("runIngestion — a down source must reach the circuit breaker", () => {
  // The breaker exists to contain outages, and could never trip for one: the
  // adapters turned discovery failures into [], extractOfficialPage turned
  // official fetch failures into null, so nothing reached `catch` and every run
  // recorded ok:true — resetting consecutive_failures on exactly the outages it
  // was built to catch.

  it("records a FAILURE when every official fetch fails", async () => {
    mocks.discover.mockResolvedValue([
      { officialUrl: "https://brand.com/a" },
      { officialUrl: "https://brand.com/b" },
    ]);
    mocks.extractOfficialPage.mockResolvedValue(null); // the source is down

    const summaries = await runIngestion();

    expect(mocks.recordRunOutcome).toHaveBeenCalledWith(
      "sweeps_advantage",
      expect.objectContaining({ ok: false }),
    );
    expect(summaries[0]).toMatchObject({ status: "error", fetched: 2, failed: 2, created: 0 });
    const notes = mocks.finishIngestionRun.mock.calls[0][3] as string;
    expect(notes).toContain("every official fetch failed (2/2)");
  });

  it("still calls a quiet day a SUCCESS — zero leads is not an outage", async () => {
    mocks.discover.mockResolvedValue([]);

    const summaries = await runIngestion();

    expect(mocks.recordRunOutcome).toHaveBeenCalledWith(
      "sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(summaries[0]).toMatchObject({ status: "ok", discovered: 0 });
  });

  it("does not call a HELD candidate an outage", async () => {
    // The source answered us perfectly well; we rejected the content. That is a
    // policy outcome, and counts.failed conflates the two — so the breaker must
    // key off fetch failures alone or a run of unpublishable sweeps would open
    // the circuit on a perfectly healthy source.
    mocks.extractOfficialPage.mockResolvedValue({
      raw: raw({ noPurchaseNecessary: null, officialRulesUrl: null }),
      pageText: "page text",
      contentHash: "hash",
    });

    const summaries = await runIngestion();

    expect(mocks.recordRunOutcome).toHaveBeenCalledWith(
      "sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(summaries[0]).toMatchObject({ status: "ok", failed: 1, created: 0 });
  });

  it("counts a partial failure as a success — one dead sponsor page is not an outage", async () => {
    mocks.discover.mockResolvedValue([
      { officialUrl: "https://brand.com/a" },
      { officialUrl: "https://brand.com/b" },
    ]);
    mocks.extractOfficialPage
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ raw: raw(), pageText: "t", contentHash: "h" });

    await runIngestion();

    expect(mocks.recordRunOutcome).toHaveBeenCalledWith(
      "sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
  });

  it("feeds the breaker when the adapter reports the source itself is down", async () => {
    mocks.discover.mockRejectedValue(
      new SourceFetchError("https://example.com/hub", "server_error", "500"),
    );

    const summaries = await runIngestion();

    expect(mocks.recordRunOutcome).toHaveBeenCalledWith(
      "sweeps_advantage",
      expect.objectContaining({ ok: false }),
    );
    expect(summaries[0]).toMatchObject({ status: "error" });
  });

  it("counts official-client requests in the ERROR path too", async () => {
    // The success path counted them; the error path did not, so a failed run
    // under-reported its own network activity — wrong exactly when it matters.
    mocks.discover.mockRejectedValue(new Error("boom"));

    await runIngestion();

    const telemetry = mocks.finishIngestionRun.mock.calls[0][4];
    expect(telemetry).toMatchObject({
      requestsMade: expect.any(Number),
      notModified: expect.any(Number),
    });
  });
});

describe("runIngestion — official_direct is gated on its own", () => {
  it("skips the whole source when official_direct is not approved", async () => {
    // Approving a discovery source says nothing about whether we may fetch
    // sponsor pages. Before this, official_direct's client was created off the
    // back of the discoverer's approval, so any approved discoverer silently
    // put an unapproved source on the network.
    mocks.getSourceRecord.mockImplementation(async (id: string) =>
      id === "official_direct"
        ? { id, complianceState: "reviewed", killSwitch: false, circuitOpenedAt: null }
        : { id, complianceState: "approved_for_production", killSwitch: false, circuitOpenedAt: null },
    );

    const summaries = await runIngestion();

    expect(mocks.discover, "must not even discover").not.toHaveBeenCalled();
    expect(mocks.extractOfficialPage).not.toHaveBeenCalled();
    expect(mocks.createIngestedListing).not.toHaveBeenCalled();
    expect(summaries).toEqual([
      expect.objectContaining({ source: "sweeps_advantage", status: "skipped" }),
    ]);
    expect(summaries[0].gate).toContain("official_direct");
  });

  it("records the refusal rather than silently returning nothing", async () => {
    mocks.getSourceRecord.mockImplementation(async (id: string) =>
      id === "official_direct"
        ? { id, complianceState: "paused", killSwitch: false, circuitOpenedAt: null }
        : { id, complianceState: "approved_for_production", killSwitch: false, circuitOpenedAt: null },
    );

    await runIngestion();

    expect(mocks.startIngestionRun).toHaveBeenCalledWith("sweeps_advantage");
    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      "run-1",
      {},
      "skipped",
      expect.stringContaining("official_direct"),
      expect.objectContaining({ gateDecision: expect.stringContaining("official_direct") }),
    );
  });
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
    // No held reasons ⇒ no notes. The 5th argument is run telemetry, which the
    // merge kept alongside the notes rather than choosing between them.
    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      "run-1",
      expect.anything(),
      "ok",
      null,
      expect.objectContaining({ gateDecision: "allowed" }),
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
