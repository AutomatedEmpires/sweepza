import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { getOfficialUrlIntakeBacklogStatus } from "@/lib/db/official-url-intake-status";

type QueryResult = {
  data?: unknown[] | null;
  count?: number | null;
  error: { message: string } | null;
};

function query(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "contains",
    "is",
    "gt",
    "not",
    "order",
    "limit",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function clientWith(results: QueryResult[]) {
  const builders = results.map(query);
  const queuedBuilders = [...builders];
  return {
    builders,
    client: {
      from: vi.fn(() => {
        const builder = queuedBuilders.shift();
        if (!builder) throw new Error("unexpected queue status query");
        return builder;
      }),
    },
  };
}

describe("official URL intake backlog status", () => {
  beforeEach(() => {
    mocks.createServiceRoleClient.mockReset();
  });

  it("counts the full official queue, including terminal malformed work", async () => {
    const { client, builders } = clientWith([
      { count: 12, error: null },
      { count: 3, error: null },
      { count: 40, error: null },
      { count: 2, error: null },
      {
        data: [{ discovered_at: "2026-07-29T08:30:00.000Z" }],
        error: null,
      },
    ]);
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

    expect(client.from).toHaveBeenCalledTimes(5);
    for (const builder of builders) {
      expect(builder.eq).toHaveBeenCalledWith(
        "source_id",
        "official_direct",
      );
      expect(builder.contains).not.toHaveBeenCalled();
    }
  });

  it("returns an empty active backlog without inventing an oldest timestamp", async () => {
    const { client } = clientWith([
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 9, error: null },
      { count: 1, error: null },
      { data: [], error: null },
    ]);
    mocks.createServiceRoleClient.mockReturnValue(client);

    const status = await getOfficialUrlIntakeBacklogStatus(
      new Date("2026-07-29T11:00:00.000Z"),
    );

    expect(status.oldestPendingAt).toBeNull();
    expect(status.oldestPendingAgeMinutes).toBeNull();
  });

  it("fails closed when any exact count is unavailable", async () => {
    const { client } = clientWith([
      { count: 1, error: null },
      { count: null, error: { message: "column unavailable" } },
      { count: 9, error: null },
      { count: 1, error: null },
      { data: [{ discovered_at: "2026-07-29T10:00:00.000Z" }], error: null },
    ]);
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(getOfficialUrlIntakeBacklogStatus()).rejects.toThrow(
      "retrying count failed: column unavailable",
    );
  });

  it("fails closed when active rows have no valid oldest timestamp", async () => {
    const { client } = clientWith([
      { count: 1, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [{ discovered_at: "not-a-date" }], error: null },
    ]);
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(getOfficialUrlIntakeBacklogStatus()).rejects.toThrow(
      "oldest pending timestamp was invalid",
    );
  });
});
