import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawExtraction } from "@/lib/ingestion/mapper";
import { SourceFetchError } from "@/lib/ingestion/source";

// runIngestion with every I/O boundary mocked; mapExtraction and
// verifyCandidate run for real, so these tests exercise the actual
// publishable hard gate between extraction and the review queue.
const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  extractOfficialPage: vi.fn(),
  createIngestedListingWithProvenance: vi.fn(),
  finishIngestionRun: vi.fn(),
  startIngestionRun: vi.fn(),
  getSourceRecord: vi.fn(),
  acquireSourceRunLease: vi.fn(),
  finishSourceRunLease: vi.fn(),
  releaseSourceRunLease: vi.fn(),
  completeWork: vi.fn(),
  deferWork: vi.fn(),
  getFetchState: vi.fn(),
  saveFetchState: vi.fn(),
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
  acquireSourceRunLease: mocks.acquireSourceRunLease,
  finishSourceRunLease: mocks.finishSourceRunLease,
  releaseSourceRunLease: mocks.releaseSourceRunLease,
  getFetchState: mocks.getFetchState,
  saveFetchState: mocks.saveFetchState,
}));

vi.mock("@/lib/db/discovery-work", () => ({
  discoveryWorkQueue: () => ({
    enqueue: vi.fn(),
    take: vi.fn(),
    complete: mocks.completeWork,
    defer: mocks.deferWork,
  }),
}));

vi.mock("@/lib/ingestion/extract", () => ({
  extractOfficialPage: mocks.extractOfficialPage,
}));

vi.mock("@/lib/db/ingestion", () => ({
  createIngestedListingWithProvenance: mocks.createIngestedListingWithProvenance,
  finishIngestionRun: mocks.finishIngestionRun,
  startIngestionRun: mocks.startIngestionRun,
}));

import { runIngestion } from "@/lib/ingestion/orchestrator";

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

// extractOfficialPage returns a CLASSIFIED result, not `Extraction | null`. The
// distinction is the point: only a real HTTP failure from the source may feed
// its circuit breaker — a 304 is not a failure, and our own extractor coming up
// empty is not the sponsor's fault.
const ok = (r: RawExtraction, finalUrl = "https://brand.com/official-rules") => ({
  status: "ok" as const,
  extraction: {
    raw: r,
    pageText: "page text",
    contentHash: "hash",
    finalUrl,
    fetchState: { etag: 'W/"accepted"', lastModified: null, httpStatus: 200 },
  },
});
const httpFailed = (failure = "server_error") => ({
  status: "failed" as const,
  failure,
  message: `official page -> ${failure}`,
});
const notModified = () => ({ status: "not_modified" as const });
const unextractable = () => ({
  status: "unextractable" as const,
  message: "the extractor returned no structured result",
});

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
  mocks.acquireSourceRunLease.mockImplementation(async (id: string) => ({
    ok: true,
    token: `lease-${id}`,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  }));
  mocks.finishSourceRunLease.mockResolvedValue(undefined);
  mocks.releaseSourceRunLease.mockResolvedValue(undefined);
  mocks.completeWork.mockResolvedValue(undefined);
  mocks.deferWork.mockResolvedValue(undefined);
  mocks.getFetchState.mockResolvedValue(null);
  mocks.saveFetchState.mockResolvedValue(undefined);
  mocks.discover.mockResolvedValue([
    { officialUrl: "https://brand.com/official-rules", discoveryWorkKey: "work-1" },
  ]);
  mocks.extractOfficialPage.mockResolvedValue(ok(raw()));
  mocks.startIngestionRun.mockResolvedValue("run-1");
  mocks.createIngestedListingWithProvenance.mockResolvedValue({
    listingId: "listing-1",
    created: true,
    suspectedDuplicateIds: [],
  });
  mocks.finishIngestionRun.mockResolvedValue(undefined);
});

describe("runIngestion — a down source must reach the circuit breaker", () => {
  // The breaker exists to contain outages, and could never trip for one: the
  // adapters turned discovery failures into [], extractOfficialPage turned
  // official fetch failures into null, so nothing reached `catch` and every run
  // recorded ok:true — resetting consecutive_failures on exactly the outages it
  // was built to catch.

  it("does not acquire a source lease when run-log creation fails first", async () => {
    mocks.startIngestionRun.mockRejectedValueOnce(new Error("run log unavailable"));

    await expect(runIngestion()).rejects.toThrow("run log unavailable");

    expect(mocks.acquireSourceRunLease).not.toHaveBeenCalled();
    expect(mocks.releaseSourceRunLease).not.toHaveBeenCalled();
  });

  it("closes the audit run when lease acquisition throws", async () => {
    mocks.acquireSourceRunLease.mockRejectedValueOnce(new Error("lease RPC transport failed"));

    const summaries = await runIngestion();

    expect(mocks.finishIngestionRun).toHaveBeenCalledWith(
      "run-1",
      {},
      "error",
      "lease RPC transport failed",
      expect.objectContaining({ requestsMade: 0 }),
    );
    expect(summaries[0]).toMatchObject({ source: "sweeps_advantage", status: "error" });
  });

  it("records a FAILURE when every official fetch fails", async () => {
    mocks.discover.mockResolvedValue([
      { officialUrl: "https://brand.com/a", discoveryWorkKey: "work-1" },
      { officialUrl: "https://brand.com/b" },
    ]);
    mocks.extractOfficialPage.mockResolvedValue(httpFailed()); // the source is down

    const summaries = await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "official_direct",
      "lease-official_direct",
      expect.objectContaining({ ok: false }),
    );
    expect(summaries[0]).toMatchObject({ status: "error", fetched: 2, failed: 2, created: 0 });
    const notes = mocks.finishIngestionRun.mock.calls[0][3] as string;
    expect(notes).toContain("every observable official response failed (2 failures)");
  });

  it("still calls a quiet day a SUCCESS — zero leads is not an outage", async () => {
    mocks.discover.mockResolvedValue([]);

    const summaries = await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(summaries[0]).toMatchObject({ status: "ok", discovered: 0 });
    expect(mocks.finishSourceRunLease).not.toHaveBeenCalledWith(
      "official_direct",
      "lease-official_direct",
      expect.anything(),
    );
  });

  it("does not call a HELD candidate an outage", async () => {
    // The source answered us perfectly well; we rejected the content. That is a
    // policy outcome, and counts.failed conflates the two — so the breaker must
    // key off fetch failures alone or a run of unpublishable sweeps would open
    // the circuit on a perfectly healthy source.
    mocks.extractOfficialPage.mockResolvedValue(
      ok(raw({ noPurchaseNecessary: null, officialRulesUrl: null })),
    );

    const summaries = await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(summaries[0]).toMatchObject({ status: "ok", failed: 1, created: 0 });
  });

  it("completes a dead sponsor page as a durable non-outage", async () => {
    mocks.discover.mockResolvedValue([
      { officialUrl: "https://brand.com/a", discoveryWorkKey: "work-1" },
      { officialUrl: "https://brand.com/b" },
    ]);
    mocks.extractOfficialPage
      .mockResolvedValueOnce(httpFailed("not_found"))
      .mockResolvedValueOnce(ok(raw()));

    await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(mocks.completeWork).toHaveBeenCalledWith("work-1");
    expect(mocks.deferWork).not.toHaveBeenCalledWith("work-1");
  });

  it("does NOT blame the source for a 304 — not-modified is not a failure", async () => {
    // Collapsing everything to `null` made a run of unchanged pages look exactly
    // like an outage and could open the circuit on a perfectly healthy source.
    mocks.discover.mockResolvedValue([
      { officialUrl: "https://brand.com/a" },
      { officialUrl: "https://brand.com/b" },
    ]);
    mocks.extractOfficialPage.mockResolvedValue(notModified());

    const summaries = await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(summaries[0]).toMatchObject({ status: "ok", skipped: 2, created: 0 });
  });

  it("does NOT blame the source when OUR extractor comes up empty", async () => {
    // We fetched the page fine. An extractor that returns nothing is our bug,
    // and must never trip a sponsor's circuit breaker.
    mocks.discover.mockResolvedValue([{ officialUrl: "https://brand.com/a" }]);
    mocks.extractOfficialPage.mockResolvedValue(unextractable());

    const summaries = await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(summaries[0]).toMatchObject({ status: "ok", failed: 1, created: 0 });
  });

  it("does NOT blame the source when our shared request budget is exhausted", async () => {
    mocks.extractOfficialPage.mockResolvedValue(httpFailed("budget_exhausted"));

    await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(mocks.deferWork).toHaveBeenCalledWith("work-1");
    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "official_direct",
      "lease-official_direct",
      expect.objectContaining({ ok: true }),
    );
  });

  it.each(["access_denied", "too_many_redirects", "empty_body", "bot_challenge"])(
    "does not let page-specific %s outcomes trip the shared official circuit",
    async (failure) => {
      mocks.extractOfficialPage.mockResolvedValue(httpFailed(failure));

      const summaries = await runIngestion();

      expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
        "official_direct",
        "lease-official_direct",
        expect.objectContaining({ ok: true }),
      );
      expect(mocks.deferWork).toHaveBeenCalledWith("work-1");
      expect(summaries[0]).toMatchObject({ status: "ok", failed: 1 });
    },
  );

  it("still records an official outage when failed requests are followed by budget exhaustion", async () => {
    mocks.discover.mockResolvedValue([
      { officialUrl: "https://brand.com/a" },
      { officialUrl: "https://brand.com/b" },
    ]);
    mocks.extractOfficialPage
      .mockResolvedValueOnce(httpFailed("server_error"))
      .mockResolvedValueOnce(httpFailed("budget_exhausted"));

    await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "official_direct",
      "lease-official_direct",
      expect.objectContaining({ ok: false }),
    );
    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
  });

  it("feeds the breaker when the adapter reports the source itself is down", async () => {
    mocks.discover.mockRejectedValue(
      new SourceFetchError("https://example.com/hub", "server_error", "500"),
    );

    const summaries = await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
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

  it("does not open the discovery breaker for an internal database failure", async () => {
    mocks.createIngestedListingWithProvenance.mockRejectedValue(new Error("database unavailable"));

    const summaries = await runIngestion();

    expect(mocks.finishSourceRunLease).toHaveBeenCalledWith(
      "sweeps_advantage",
      "lease-sweeps_advantage",
      expect.objectContaining({ ok: true }),
    );
    expect(summaries[0]).toMatchObject({ status: "error" });
    expect(mocks.completeWork).not.toHaveBeenCalled();
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
    expect(mocks.createIngestedListingWithProvenance).not.toHaveBeenCalled();
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
    expect(mocks.createIngestedListingWithProvenance).toHaveBeenCalledTimes(1);
    expect(mocks.completeWork).toHaveBeenCalledWith("work-1");
    expect(mocks.saveFetchState).toHaveBeenCalledTimes(1);
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

  it("does not persist a final-hop validator under a redirecting request URL", async () => {
    mocks.extractOfficialPage.mockResolvedValue(
      ok(raw(), "https://sponsor-cdn.example.com/final-rules"),
    );

    const summaries = await runIngestion();

    expect(mocks.createIngestedListingWithProvenance).toHaveBeenCalledTimes(1);
    expect(mocks.completeWork).toHaveBeenCalledWith("work-1");
    expect(mocks.saveFetchState).not.toHaveBeenCalled();
    expect(summaries[0]).toMatchObject({ status: "ok", created: 1 });
  });

  it("treats www and trailing-slash changes as redirects for validator safety", async () => {
    // Listing identity normalization intentionally equates these URLs. HTTP
    // validator identity must not: the final server emitted the ETag.
    mocks.extractOfficialPage.mockResolvedValue(
      ok(raw(), "https://www.brand.com/official-rules/"),
    );

    await runIngestion();

    expect(mocks.saveFetchState).not.toHaveBeenCalled();
    expect(mocks.completeWork).toHaveBeenCalledWith("work-1");
  });

  it("counts a concurrent database claimant as skipped, never as a second creation", async () => {
    mocks.createIngestedListingWithProvenance.mockResolvedValue({
      listingId: "listing-won-by-other-run",
      created: false,
    });

    const summaries = await runIngestion();

    expect(summaries[0]).toMatchObject({ created: 0, skipped: 1 });
    expect(mocks.saveFetchState).toHaveBeenCalledTimes(1);
  });

  it("holds a candidate that fails a hard check — no draft row, reasons in run notes", async () => {
    // Missing no-purchase signal AND missing rules URL: both are hard gates.
    mocks.extractOfficialPage.mockResolvedValue(
      ok(raw({ noPurchaseNecessary: null, officialRulesUrl: null })),
    );

    const summaries = await runIngestion();
    expect(mocks.createIngestedListingWithProvenance).not.toHaveBeenCalled();
    expect(
      mocks.saveFetchState,
      "a completed hold may safely use its validator until the page changes",
    ).toHaveBeenCalledTimes(1);
    expect(summaries).toEqual([
      expect.objectContaining({ status: "ok", created: 0, failed: 1 }),
    ]);

    const notes = mocks.finishIngestionRun.mock.calls[0][3];
    expect(notes).toContain("held:");
    expect(notes).toContain("no_purchase_necessary");
    expect(notes).toContain("has_official_rules_url");
  });

  it("holds a candidate whose end date has passed", async () => {
    mocks.extractOfficialPage.mockResolvedValue(ok(raw({ endDate: "2020-01-01" })));

    await runIngestion();
    expect(mocks.createIngestedListingWithProvenance).not.toHaveBeenCalled();
    const notes = mocks.finishIngestionRun.mock.calls[0][3];
    expect(notes).toContain("end_date_in_future");
  });

  it("routes substance failures (empty title/description) through the same hold path", async () => {
    // These used to short-circuit on a separate NOT NULL guard that never
    // reported reasons; they must land in the run notes like any hard failure.
    mocks.extractOfficialPage.mockResolvedValue(ok(raw({ title: "", shortDescription: "" })));

    const summaries = await runIngestion();
    expect(mocks.createIngestedListingWithProvenance).not.toHaveBeenCalled();
    expect(summaries).toEqual([
      expect.objectContaining({ status: "ok", created: 0, failed: 1 }),
    ]);
    const notes = mocks.finishIngestionRun.mock.calls[0][3];
    expect(notes).toContain("has_title");
    expect(notes).toContain("has_short_description");
  });

  it("does not discard repeated official URLs before variant extraction", async () => {
    mocks.discover.mockResolvedValue([
      { officialUrl: "https://brand.com/official-rules", discoveryWorkKey: "work-1" },
      { officialUrl: "https://www.brand.com/official-rules/", discoveryWorkKey: "work-2" },
    ]);
    mocks.extractOfficialPage
      .mockResolvedValueOnce(ok(raw({ endDate: FUTURE })))
      .mockResolvedValueOnce(ok(raw({ endDate: "2027-08-01" })));

    await runIngestion();

    expect(mocks.extractOfficialPage).toHaveBeenCalledTimes(2);
    expect(mocks.createIngestedListingWithProvenance).toHaveBeenCalledTimes(2);
    const variants = mocks.createIngestedListingWithProvenance.mock.calls.map(
      (call) => call[1].variantKey,
    );
    expect(new Set(variants).size).toBe(2);
    expect(mocks.completeWork).toHaveBeenCalledWith("work-1");
    expect(mocks.completeWork).toHaveBeenCalledWith("work-2");
  });
});
