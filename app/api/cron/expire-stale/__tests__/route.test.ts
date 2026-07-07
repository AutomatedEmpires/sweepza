import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { GET } from "@/app/api/cron/expire-stale/route";

type QueryResult = { data?: Array<{ id: string; slug: string; end_date: string }>; error: { message: string } | null };

let lookupResult: QueryResult;
let updateResults: Record<string, { error: { message: string } | null }>;
let lookupQuery: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
};
let updateQuery: {
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
};

function cronRequest(token = "cron-secret"): Request {
  return new Request("http://test.local/api/cron/expire-stale", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function resetSupabaseMock() {
  lookupResult = { data: [], error: null };
  updateResults = {};

  lookupQuery = {
    select: vi.fn(() => lookupQuery),
    eq: vi.fn(() => lookupQuery),
    lt: vi.fn(() => Promise.resolve(lookupResult)),
  };
  updateQuery = {
    update: vi.fn(() => updateQuery),
    eq: vi.fn((_column: string, id: string) =>
      Promise.resolve(updateResults[id] ?? { error: null }),
    ),
  };

  mocks.createServiceRoleClient.mockReturnValue({
    from: vi.fn(() => ({
      select: lookupQuery.select,
      update: updateQuery.update,
    })),
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  mocks.captureException.mockReset();
  mocks.createServiceRoleClient.mockReset();
  resetSupabaseMock();
});

describe("GET /api/cron/expire-stale", () => {
  it("returns 503 when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(cronRequest());
    expect(response.status).toBe(503);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token does not match", async () => {
    const response = await GET(cronRequest("wrong-secret"));
    expect(response.status).toBe(401);
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("looks up only active public stale listings", async () => {
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(lookupQuery.eq).toHaveBeenCalledWith("lifecycle_status", "active");
    expect(lookupQuery.eq).toHaveBeenCalledWith("visibility_status", "public");
    expect(lookupQuery.lt).toHaveBeenCalledWith("end_date", expect.any(String));
  });

  it("reports lookup failures to Sentry", async () => {
    lookupResult = { data: [], error: { message: "lookup failed" } };
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it("partitions successful and failed expiration updates", async () => {
    lookupResult = {
      data: [
        { id: "ok-id", slug: "old-sweep", end_date: "2026-01-01" },
        { id: "bad-id", slug: "stuck-sweep", end_date: "2026-01-02" },
      ],
      error: null,
    };
    updateResults = {
      "bad-id": { error: { message: "update failed" } },
    };

    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: false,
      checked: 2,
      expired: ["old-sweep"],
      failed: ["stuck-sweep"],
    });
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
