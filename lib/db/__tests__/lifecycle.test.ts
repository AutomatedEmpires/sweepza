import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DuplicateExplanation } from "@/lib/ingestion/fingerprint";
import type { ChangeAssessment, ReverificationPlan } from "@/lib/ingestion/lifecycle";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ from: mocks.from }),
}));

import {
  recordChangeEvents,
  recordDuplicateCandidate,
  saveDeadLinkStatus,
  saveReverificationSchedule,
} from "@/lib/db/lifecycle";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({
    update: mocks.update,
    insert: mocks.insert,
    upsert: mocks.upsert,
  });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { listing_id: "listing-1" }, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("listing lifecycle persistence", () => {
  const plan: ReverificationPlan = {
    nextDueAt: new Date("2026-07-20T12:00:00Z"),
    priority: 42,
    reasons: ["ending soon", "open report"],
  };

  it("persists the full schedule explanation", async () => {
    await saveReverificationSchedule("listing-1", plan, new Date("2026-07-19T12:00:00Z"));
    expect(mocks.update).toHaveBeenCalledWith({
      next_verify_due_at: "2026-07-20T12:00:00.000Z",
      verify_priority: 42,
      verify_reasons: ["ending soon", "open report"],
      last_verified_at: "2026-07-19T12:00:00.000Z",
    });
  });

  it("rejects a silent zero-row schedule update", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(saveReverificationSchedule("missing", plan, null)).rejects.toThrow(
      'no ingestion row for "missing"',
    );
  });

  it("validates and persists dead-link counters", async () => {
    await saveDeadLinkStatus("listing-1", {
      deadLinkStatus: "suspected",
      consecutiveFailures: 1,
      lastFailureClass: "not_found",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      dead_link_status: "suspected",
      consecutive_fetch_failures: 1,
      last_fetch_failure_class: "not_found",
    });
    await expect(
      saveDeadLinkStatus("listing-1", {
        deadLinkStatus: null,
        consecutiveFailures: -1,
        lastFailureClass: null,
      }),
    ).rejects.toThrow(/nonnegative integer/);
  });

  it("rejects a silent zero-row dead-link update", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      saveDeadLinkStatus("missing", {
        deadLinkStatus: null,
        consecutiveFailures: 0,
        lastFailureClass: null,
      }),
    ).rejects.toThrow('no ingestion row for "missing"');
  });

  it("records material changes with overwrite permission, but skips unchanged", async () => {
    const changed: ChangeAssessment = {
      disposition: "changed_material",
      changes: [{ field: "endDate", from: "2026-08-01", to: "2026-09-01", material: true }],
      overwriteAllowed: true,
      reasons: ["deadline changed"],
    };
    await recordChangeEvents("listing-1", changed);
    expect(mocks.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        listing_id: "listing-1",
        field: "endDate",
        disposition: "changed_material",
        overwrite_allowed: true,
      }),
    ]);

    mocks.insert.mockClear();
    await recordChangeEvents("listing-1", {
      disposition: "unchanged",
      changes: [],
      overwriteAllowed: false,
      reasons: [],
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("records a synthetic closure event when there are no field deltas", async () => {
    await recordChangeEvents("listing-1", {
      disposition: "closed",
      changes: [],
      overwriteAllowed: false,
      reasons: ["closed on page"],
    });
    expect(mocks.insert).toHaveBeenCalledWith([
      expect.objectContaining({ field: "closed", material: true, overwrite_allowed: false }),
    ]);
  });

  it("normalizes duplicate-pair ordering and never reopens resolution", async () => {
    const explanation: DuplicateExplanation = {
      verdict: "suspected",
      strength: 0.75,
      signals: [],
      reason: "review",
    };
    await recordDuplicateCandidate("listing-z", "listing-a", explanation);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        listing_id: "listing-a",
        other_listing_id: "listing-z",
        verdict: "suspected",
        strength: 0.75,
      }),
      { onConflict: "listing_id,other_listing_id" },
    );
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty("resolved");
  });

  it("rejects self-pairs and invalid strength before touching the database", async () => {
    const explanation: DuplicateExplanation = {
      verdict: "suspected",
      strength: 0.5,
      signals: [],
      reason: "review",
    };
    await expect(recordDuplicateCandidate("same", "same", explanation)).rejects.toThrow(
      /cannot duplicate itself/,
    );
    await expect(
      recordDuplicateCandidate("a", "b", { ...explanation, strength: Number.NaN }),
    ).rejects.toThrow(/between 0 and 1/);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
