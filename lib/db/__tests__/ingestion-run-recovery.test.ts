import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  recoverStaleIngestionRuns,
  STALE_INGESTION_RUN_AFTER_MINUTES,
} from "@/lib/db/ingestion";

const NOW = new Date("2026-07-29T17:00:00.000Z");
const CUTOFF = "2026-07-29T16:45:00.000Z";

describe("recoverStaleIngestionRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ lt: mocks.lt });
    mocks.lt.mockReturnValue({ select: mocks.select });
    mocks.select.mockResolvedValue({ data: [], error: null });
  });

  it("uses a cutoff beyond both the 300s route limit and 600s source lease", () => {
    expect(STALE_INGESTION_RUN_AFTER_MINUTES).toBe(15);
    expect(STALE_INGESTION_RUN_AFTER_MINUTES * 60).toBeGreaterThan(300);
    expect(STALE_INGESTION_RUN_AFTER_MINUTES * 60).toBeGreaterThan(600);
  });

  it("atomically closes only stale running rows with an audit-visible reason", async () => {
    mocks.select.mockResolvedValue({
      data: [{ id: "abandoned-run" }],
      error: null,
    });

    const result = await recoverStaleIngestionRuns(NOW);

    expect(mocks.from).toHaveBeenCalledWith("ingestion_run");
    expect(mocks.update).toHaveBeenCalledWith({
      status: "error",
      finished_at: NOW.toISOString(),
      notes: expect.stringContaining("Automatic stale-run recovery"),
    });
    const update = mocks.update.mock.calls[0][0] as { notes: string };
    expect(update.notes).toContain("15 minutes");
    expect(update.notes).toContain(`recovered_at=${NOW.toISOString()}`);
    expect(update.notes).toContain(`cutoff_at=${CUTOFF}`);
    expect(mocks.eq).toHaveBeenCalledWith("status", "running");
    expect(mocks.lt).toHaveBeenCalledWith("started_at", CUTOFF);
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({
      recovered: 1,
      recoveredAt: NOW.toISOString(),
      cutoffAt: CUTOFF,
    });
  });

  it("is idempotent when recovery is repeated", async () => {
    mocks.select
      .mockResolvedValueOnce({ data: [{ id: "abandoned-run" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const first = await recoverStaleIngestionRuns(NOW);
    const second = await recoverStaleIngestionRuns(NOW);

    expect(first.recovered).toBe(1);
    expect(second.recovered).toBe(0);
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "status", "running");
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "status", "running");
  });

  it("fails visibly instead of starting a run with an unrecoverable ledger", async () => {
    mocks.select.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(recoverStaleIngestionRuns(NOW)).rejects.toThrow(
      "recoverStaleIngestionRuns failed: permission denied",
    );
  });
});
