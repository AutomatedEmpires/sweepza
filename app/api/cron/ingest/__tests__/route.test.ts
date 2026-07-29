import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSourceDescriptor } from "@/lib/ingestion/source";

// The master switch is only a switch if something proves it is OFF. These assert
// the thing that actually matters: when ingestion is disabled, runIngestion is
// NEVER INVOKED — a 200 body saying "skipped" would be worthless if the run had
// already happened behind it.

const mocks = vi.hoisted(() => ({
  runIngestion: vi.fn(),
  recoverStaleIngestionRuns: vi.fn(),
  captureException: vi.fn(),
  env: { INGESTION_ENABLED: undefined as string | undefined, ANTHROPIC_API_KEY: "sk-test" },
}));

vi.mock("@/lib/ingestion/orchestrator", () => ({ runIngestion: mocks.runIngestion }));
vi.mock("@/lib/db/ingestion", () => ({
  recoverStaleIngestionRuns: mocks.recoverStaleIngestionRuns,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET, maxDuration } from "../route";

const SECRET = "cron-secret-for-tests";
const vercelConfig = JSON.parse(
  readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8"),
) as {
  crons: Array<{ path: string; schedule: string }>;
};
const operationsReadme = readFileSync(
  new URL("../../../../../README.md", import.meta.url),
  "utf8",
);

function request(auth?: string): Request {
  return new Request("https://sweepza.com/api/cron/ingest", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mocks.env.INGESTION_ENABLED = "true";
  mocks.env.ANTHROPIC_API_KEY = "sk-test";
  mocks.runIngestion.mockResolvedValue([
    { source: "sweeps_advantage", status: "ok", created: 2 },
  ]);
  mocks.recoverStaleIngestionRuns.mockResolvedValue({
    recovered: 0,
    recoveredAt: "2026-07-29T17:00:00.000Z",
    cutoffAt: "2026-07-29T16:45:00.000Z",
  });
});

describe("GET /api/cron/ingest — authorization", () => {
  it("503s when CRON_SECRET is not configured, without running", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(mocks.runIngestion).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller, without running", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.runIngestion).not.toHaveBeenCalled();
  });

  it("401s a wrong secret, without running", async () => {
    const response = await GET(request("Bearer not-the-secret"));
    expect(response.status).toBe(401);
    expect(mocks.runIngestion).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/ingest — the master switch", () => {
  it("schedules ingestion before expiry twice daily without bypassing the disabled gate", async () => {
    expect(vercelConfig.crons).toEqual([
      { path: "/api/cron/ingest", schedule: "30 5,17 * * *" },
      { path: "/api/cron/expire-stale", schedule: "10 6,18 * * *" },
      { path: "/api/cron/seeker-reminders", schedule: "0 14 * * *" },
    ]);
    expect(operationsReadme).toContain(
      "| `/api/cron/ingest` | twice daily 05:30 and 17:30 UTC |",
    );
    expect(operationsReadme).toContain(
      "| `/api/cron/expire-stale` | twice daily 06:10 and 18:10 UTC |",
    );

    const ingestionCron = vercelConfig.crons.find(
      (cron) => cron.path === "/api/cron/ingest",
    );
    const officialSource = getSourceDescriptor("official_direct");
    expect(ingestionCron).toBeDefined();
    expect(officialSource).toBeDefined();

    const [minuteField, hourField] = ingestionCron!.schedule.split(" ");
    const minute = Number(minuteField);
    const runMinutes = hourField
      .split(",")
      .map((hour) => Number(hour) * 60 + minute)
      .sort((left, right) => left - right);
    const cadenceGaps = runMinutes.map((value, index) => {
      const next = runMinutes[(index + 1) % runMinutes.length];
      return next > value ? next - value : 24 * 60 + next - value;
    });

    expect(cadenceGaps).toEqual([720, 720]);
    expect(officialSource!.refreshIntervalMinutes).toBe(720);
    expect(officialSource!.refreshIntervalMinutes).toBe(cadenceGaps[0]);
    expect(maxDuration).toBe(300);

    mocks.env.INGESTION_ENABLED = undefined;
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(mocks.runIngestion).not.toHaveBeenCalled();
  });

  it("is a 200 no-op that DOES NOT run ingestion when the switch is unset", async () => {
    mocks.env.INGESTION_ENABLED = undefined;

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, sources: [] });
    expect(body.skipped).toContain("INGESTION_ENABLED");
    // The point of the whole test file.
    expect(mocks.recoverStaleIngestionRuns).not.toHaveBeenCalled();
    expect(mocks.runIngestion).not.toHaveBeenCalled();
  });

  it("refuses any value that is not the literal \"true\"", async () => {
    // "1", "yes", "TRUE" must not enable a live crawler by accident.
    for (const value of ["1", "yes", "TRUE", "True", "false", ""]) {
      mocks.runIngestion.mockClear();
      mocks.env.INGESTION_ENABLED = value;

      const response = await GET(request(`Bearer ${SECRET}`));

      expect(response.status, `INGESTION_ENABLED="${value}"`).toBe(200);
      expect(mocks.runIngestion, `INGESTION_ENABLED="${value}" must not run`).not.toHaveBeenCalled();
    }
  });
});

describe("GET /api/cron/ingest — extractor configuration", () => {
  it("503s without an extractor key, and does not run", async () => {
    mocks.env.ANTHROPIC_API_KEY = "";

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("ANTHROPIC_API_KEY");
    // Extraction is impossible, so a run could only burn the source's budget.
    expect(mocks.recoverStaleIngestionRuns).not.toHaveBeenCalled();
    expect(mocks.runIngestion).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/ingest — enabled", () => {
  it("runs and reports what was created", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.recoverStaleIngestionRuns).toHaveBeenCalledOnce();
    expect(mocks.runIngestion).toHaveBeenCalledWith({ limit: 25 });
    expect(
      mocks.recoverStaleIngestionRuns.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.runIngestion.mock.invocationCallOrder[0]);
    expect(body).toMatchObject({
      ok: true,
      created: 2,
      recoveredStaleRuns: 0,
    });
    expect(body.sources).toHaveLength(1);
  });

  it("reports how many abandoned run records were recovered", async () => {
    mocks.recoverStaleIngestionRuns.mockResolvedValue({
      recovered: 2,
      recoveredAt: "2026-07-29T17:00:00.000Z",
      cutoffAt: "2026-07-29T16:45:00.000Z",
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recoveredStaleRuns).toBe(2);
  });

  it("sums created across sources", async () => {
    mocks.runIngestion.mockResolvedValue([
      { source: "a", status: "ok", created: 2 },
      { source: "b", status: "ok", created: 3 },
      { source: "c", status: "skipped" }, // no `created` key at all
    ]);

    const body = await (await GET(request(`Bearer ${SECRET}`))).json();

    expect(body.created).toBe(5);
  });

  it("keeps policy and cadence skips as a healthy no-op", async () => {
    mocks.runIngestion.mockResolvedValue([
      { source: "a", status: "skipped", gate: "refresh_not_due" },
      { source: "b", status: "skipped", gate: "record_not_production_approved" },
    ]);

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, created: 0 });
    expect(body.sources).toHaveLength(2);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("returns a failed cron response when any eligible source execution errors", async () => {
    mocks.runIngestion.mockResolvedValue([
      { source: "healthy_source", status: "ok", created: 3 },
      { source: "failed_source", status: "error", failed: 1 },
      { source: "waiting_source", status: "skipped", gate: "refresh_not_due" },
    ]);

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: "One or more ingestion sources failed.",
      created: 3,
    });
    expect(body.sources).toHaveLength(3);
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("failed_source"),
      }),
      expect.objectContaining({
        tags: { operation: "ingestion_cron" },
        extra: expect.objectContaining({
          failedSources: ["failed_source"],
          created: 3,
        }),
      }),
    );
  });

  it("500s and reports to Sentry when the run throws", async () => {
    mocks.runIngestion.mockRejectedValue(new Error("source registry unreachable"));

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("source registry unreachable");
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it("fails before live execution when stale-run recovery is unavailable", async () => {
    mocks.recoverStaleIngestionRuns.mockRejectedValue(
      new Error("ingestion ledger unavailable"),
    );

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("ingestion ledger unavailable");
    expect(mocks.runIngestion).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
