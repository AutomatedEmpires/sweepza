import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  createServiceRoleClient: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  // listings-cache.ts (imported transitively for the tag constant) calls
  // unstable_cache at module load; a passthrough keeps that import side-effect-free.
  unstable_cache: (fn: unknown) => fn,
}));

import { GET } from "@/app/api/cron/expire-stale/route";

type RpcResult = {
  data?: Array<{ id: string; slug: string; end_date: string }>;
  error: { message: string } | null;
};

let rpcResult: RpcResult;
let rpc: ReturnType<typeof vi.fn>;

function cronRequest(token = "cron-secret"): Request {
  return new Request("http://test.local/api/cron/expire-stale", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function resetSupabaseMock() {
  rpcResult = { data: [], error: null };
  rpc = vi.fn(() => Promise.resolve(rpcResult));
  mocks.createServiceRoleClient.mockReturnValue({ rpc });
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  mocks.captureException.mockReset();
  mocks.createServiceRoleClient.mockReset();
  mocks.revalidateTag.mockReset();
  resetSupabaseMock();
});

afterEach(() => {
  vi.useRealTimers();
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

  it("expires stale listings through the atomic database function", async () => {
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("expire_stale_listings", {
      p_today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("passes yesterday as the expiry floor until the UTC-12 grace lapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T11:59:59.999Z"));

    await GET(cronRequest());

    expect(rpc).toHaveBeenCalledWith("expire_stale_listings", {
      p_today: "2026-07-16",
    });
  });

  it("advances the expiry floor exactly when the UTC-12 grace lapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00.000Z"));

    await GET(cronRequest());

    expect(rpc).toHaveBeenCalledWith("expire_stale_listings", {
      p_today: "2026-07-17",
    });
  });

  it("does not bust the public feed cache when nothing expired", async () => {
    await GET(cronRequest());
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("reports transaction failures to Sentry", async () => {
    rpcResult = { data: [], error: { message: "transaction failed" } };
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it("returns every atomic transition and refreshes the public cache", async () => {
    rpcResult = {
      data: [
        { id: "ok-id", slug: "old-sweep", end_date: "2026-01-01" },
        { id: "second-id", slug: "older-sweep", end_date: "2026-01-02" },
      ],
      error: null,
    };

    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      checked: 2,
      expired: ["old-sweep", "older-sweep"],
      failed: [],
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).toHaveBeenCalledWith("public-listings");
  });
});
