import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  discoveryWorkQueue,
  enqueueOfficialUrlIntakeWork,
  OfficialUrlIntakeIdempotencyConflictError,
} from "@/lib/db/discovery-work";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServiceRoleClient.mockReturnValue({ rpc: mocks.rpc });
});

describe("discovery work claim persistence", () => {
  it("refuses the generic enqueue path for official-direct work", async () => {
    const queue = discoveryWorkQueue("official_direct");

    await expect(
      queue.enqueue([
        {
          key: "immutable-key",
          payload: { officialUrl: "https://different.example.com" },
        },
      ]),
    ).rejects.toThrow(
      "official_direct requires strict official URL intake",
    );
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the immutable official-intake RPC and returns actual inserts", async () => {
    const items = [{ key: "immutable-key", payload: { officialUrl: "https://example.com" } }];
    mocks.rpc.mockResolvedValue({ data: 1, error: null });

    await expect(enqueueOfficialUrlIntakeWork(items)).resolves.toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "enqueue_official_url_intake_work",
      { p_items: items },
    );
  });

  it("maps a conflicting replay to the typed 409 boundary", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "official_url_intake_idempotency_conflict" },
    });

    await expect(
      enqueueOfficialUrlIntakeWork([{ key: "immutable-key", payload: { version: 2 } }]),
    ).rejects.toBeInstanceOf(OfficialUrlIntakeIdempotencyConflictError);
  });

  it("claims atomically and binds every terminal mutation to its token", async () => {
    const queue = discoveryWorkQueue("official_direct");
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          {
            item_key: "work-1",
            payload: { officialUrl: "https://example.com" },
            claim_token: "55555555-5555-4555-8555-555555555555",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(queue.take(20)).resolves.toEqual([
      {
        key: "work-1",
        payload: { officialUrl: "https://example.com" },
        claimToken: "55555555-5555-4555-8555-555555555555",
      },
    ]);
    await queue.complete(
      "work-1",
      "55555555-5555-4555-8555-555555555555",
    );
    await queue.defer(
      "work-2",
      "66666666-6666-4666-8666-666666666666",
    );
    await queue.deadLetter(
      "work-3",
      "77777777-7777-4777-8777-777777777777",
      "invalid payload",
    );

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "claim_source_discovery_work",
      {
        p_source_id: "official_direct",
        p_limit: 20,
        p_lease_seconds: 900,
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "complete_source_discovery_work",
      {
        p_source_id: "official_direct",
        p_item_key: "work-1",
        p_claim_token: "55555555-5555-4555-8555-555555555555",
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "defer_source_discovery_work",
      {
        p_source_id: "official_direct",
        p_item_key: "work-2",
        p_claim_token: "66666666-6666-4666-8666-666666666666",
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      4,
      "dead_letter_source_discovery_work",
      {
        p_source_id: "official_direct",
        p_item_key: "work-3",
        p_claim_token: "77777777-7777-4777-8777-777777777777",
        p_reason: "invalid payload",
      },
    );
  });

  it("fails visibly when a stale claim loses its compare-and-set", async () => {
    const queue = discoveryWorkQueue("official_direct");
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    await expect(
      queue.complete(
        "work-1",
        "55555555-5555-4555-8555-555555555555",
      ),
    ).rejects.toThrow('claim lost for "work-1"');
  });
});
