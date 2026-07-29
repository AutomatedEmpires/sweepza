import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { getOfficialUrlIntakeBacklogStatus } from "@/lib/db/official-url-intake-status";

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

function clientWith(result: RpcResult) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  };
}

describe("official URL intake backlog status", () => {
  beforeEach(() => {
    mocks.createServiceRoleClient.mockReset();
  });

  it("reads all queue aggregates from one database snapshot", async () => {
    const client = clientWith({
      data: [{
        pending: 12,
        retrying: 3,
        completed: 40,
        dead_lettered: 2,
        oldest_pending_at: "2026-07-29T08:30:00.000Z",
      }],
      error: null,
    });
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(
      getOfficialUrlIntakeBacklogStatus(
        new Date("2026-07-29T11:00:00.000Z"),
      ),
    ).resolves.toEqual({
      pending: 12,
      retrying: 3,
      completed: 40,
      deadLettered: 2,
      oldestPendingAt: "2026-07-29T08:30:00.000Z",
      oldestPendingAgeMinutes: 150,
      sampledAt: "2026-07-29T11:00:00.000Z",
    });

    expect(client.rpc).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith(
      "get_official_url_intake_backlog_status",
    );
  });

  it("returns an empty active backlog without inventing an oldest timestamp", async () => {
    const client = clientWith({
      data: [{
        pending: "0",
        retrying: "0",
        completed: "9",
        dead_lettered: "1",
        oldest_pending_at: null,
      }],
      error: null,
    });
    mocks.createServiceRoleClient.mockReturnValue(client);

    const status = await getOfficialUrlIntakeBacklogStatus(
      new Date("2026-07-29T11:00:00.000Z"),
    );

    expect(status.oldestPendingAt).toBeNull();
    expect(status.oldestPendingAgeMinutes).toBeNull();
  });

  it("fails closed when the atomic snapshot RPC is unavailable", async () => {
    const client = clientWith({
      data: null,
      error: { message: "function unavailable" },
    });
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(getOfficialUrlIntakeBacklogStatus()).rejects.toThrow(
      "snapshot failed: function unavailable",
    );
  });

  it("fails closed when any exact count is unavailable", async () => {
    const client = clientWith({
      data: [{
        pending: 1,
        retrying: null,
        completed: 9,
        dead_lettered: 1,
        oldest_pending_at: "2026-07-29T10:00:00.000Z",
      }],
      error: null,
    });
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(getOfficialUrlIntakeBacklogStatus()).rejects.toThrow(
      "retrying count returned no exact count",
    );
  });

  it("fails closed when active rows have no valid oldest timestamp", async () => {
    const client = clientWith({
      data: [{
        pending: 1,
        retrying: 0,
        completed: 0,
        dead_lettered: 0,
        oldest_pending_at: "not-a-date",
      }],
      error: null,
    });
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(getOfficialUrlIntakeBacklogStatus()).rejects.toThrow(
      "oldest pending timestamp was invalid",
    );
  });
});
