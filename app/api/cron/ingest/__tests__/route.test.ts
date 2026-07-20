import { beforeEach, describe, expect, it, vi } from "vitest";

// The master switch is only a switch if something proves it is OFF. These assert
// the thing that actually matters: when ingestion is disabled, runIngestion is
// NEVER INVOKED — a 200 body saying "skipped" would be worthless if the run had
// already happened behind it.

const mocks = vi.hoisted(() => ({
  runIngestion: vi.fn(),
  captureException: vi.fn(),
  env: { INGESTION_ENABLED: undefined as string | undefined, ANTHROPIC_API_KEY: "sk-test" },
}));

vi.mock("@/lib/ingestion/orchestrator", () => ({ runIngestion: mocks.runIngestion }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET } from "../route";

const SECRET = "cron-secret-for-tests";

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
  it("is a 200 no-op that DOES NOT run ingestion when the switch is unset", async () => {
    mocks.env.INGESTION_ENABLED = undefined;

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, sources: [] });
    expect(body.skipped).toContain("INGESTION_ENABLED");
    // The point of the whole test file.
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
    expect(mocks.runIngestion).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/ingest — enabled", () => {
  it("runs and reports what was created", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.runIngestion).toHaveBeenCalledWith({ limit: 25 });
    expect(body).toMatchObject({ ok: true, created: 2 });
    expect(body.sources).toHaveLength(1);
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

  it("500s and reports to Sentry when the run throws", async () => {
    mocks.runIngestion.mockRejectedValue(new Error("source registry unreachable"));

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("source registry unreachable");
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
