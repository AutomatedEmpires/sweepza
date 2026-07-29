import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  enqueueOfficialUrlIntakeWork: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/db/discovery-work", () => ({
  enqueueOfficialUrlIntakeWork: mocks.enqueueOfficialUrlIntakeWork,
  OfficialUrlIntakeIdempotencyConflictError: class extends Error {},
}));

import {
  enqueueDueOfficialUrlRevalidations,
  enqueueOfficialUrlIntake,
  officialUrlIntakeItemKey,
  OfficialUrlIntakeRevalidationNotFoundError,
  revalidateOfficialUrlIntake,
} from "@/lib/db/official-url-intake";

const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServiceRoleClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.enqueueOfficialUrlIntakeWork.mockResolvedValue(1);
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
});

describe("official URL intake persistence", () => {
  it("uses a stable, actor-scoped idempotency key", () => {
    const first = officialUrlIntakeItemKey(
      ACTOR_ID,
      "partner-feed:promotion-42",
    );
    const replay = officialUrlIntakeItemKey(
      ACTOR_ID,
      "partner-feed:promotion-42",
    );
    const differentActor = officialUrlIntakeItemKey(
      "44444444-4444-4444-8444-444444444444",
      "partner-feed:promotion-42",
    );

    expect(first).toBe(replay);
    expect(first).toMatch(/^admin-official:[a-f0-9]{64}$/);
    expect(differentActor).not.toBe(first);
    expect(first).not.toContain("promotion-42");
  });

  it("enqueues attributed payloads in the existing official-direct queue", async () => {
    const result = await enqueueOfficialUrlIntake({
      actorAppUserId: ACTOR_ID,
      entries: [
        {
          idempotencyKey: "partner-feed:promotion-42",
          officialUrl: "https://sponsor.example.com/rules/42",
        },
      ],
    });

    expect(mocks.enqueueOfficialUrlIntakeWork).toHaveBeenCalledWith([
      {
        key: officialUrlIntakeItemKey(
          ACTOR_ID,
          "partner-feed:promotion-42",
        ),
        payload: {
          kind: "admin_official_url_v1",
          officialUrl: "https://sponsor.example.com/rules/42",
          idempotencyKey: "partner-feed:promotion-42",
          authority: {
            type: "sweepza_operator",
            appUserId: ACTOR_ID,
          },
        },
      },
    ]);
    expect(result).toEqual({ accepted: 1, replayed: 0 });
  });

  it("reports exact replays as unchanged work", async () => {
    const input = {
      actorAppUserId: ACTOR_ID,
      entries: [
        {
          idempotencyKey: "partner-feed:promotion-42",
          officialUrl: "https://sponsor.example.com/rules/42",
        },
      ],
    };

    mocks.enqueueOfficialUrlIntakeWork
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    await expect(enqueueOfficialUrlIntake(input)).resolves.toEqual({
      accepted: 1,
      replayed: 0,
    });
    await expect(enqueueOfficialUrlIntake(input)).resolves.toEqual({
      accepted: 0,
      replayed: 1,
    });

    expect(mocks.enqueueOfficialUrlIntakeWork).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueOfficialUrlIntakeWork.mock.calls[0][0]).toEqual(
      mocks.enqueueOfficialUrlIntakeWork.mock.calls[1][0],
    );
  });

  it("queues a fresh explicit generation without changing the request identity", async () => {
    const input = {
      actorAppUserId: ACTOR_ID,
      entries: [
        {
          idempotencyKey: "partner-feed:promotion-42",
          officialUrl: "https://sponsor.example.com/rules/42",
        },
      ],
    };

    await expect(revalidateOfficialUrlIntake(input)).resolves.toEqual({
      revalidated: 1,
      pending: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "revalidate_official_url_intake_work",
      {
        p_items: [
          {
            key: officialUrlIntakeItemKey(
              ACTOR_ID,
              "partner-feed:promotion-42",
            ),
            payload: {
              kind: "admin_official_url_v1",
              officialUrl: "https://sponsor.example.com/rules/42",
              idempotencyKey: "partner-feed:promotion-42",
              authority: {
                type: "sweepza_operator",
                appUserId: ACTOR_ID,
              },
            },
          },
        ],
        p_reason: "operator_revalidation",
      },
    );
  });

  it("reports unfinished generations and missing immutable requests safely", async () => {
    const input = {
      actorAppUserId: ACTOR_ID,
      entries: [
        {
          idempotencyKey: "partner-feed:promotion-42",
          officialUrl: "https://sponsor.example.com/rules/42",
        },
      ],
    };
    mocks.rpc.mockResolvedValueOnce({ data: 0, error: null });

    await expect(revalidateOfficialUrlIntake(input)).resolves.toEqual({
      revalidated: 0,
      pending: 1,
    });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "official_url_intake_revalidation_not_found",
      },
    });
    await expect(
      revalidateOfficialUrlIntake(input),
    ).rejects.toBeInstanceOf(
      OfficialUrlIntakeRevalidationNotFoundError,
    );
  });

  it("exports the bounded scheduled-generation RPC wrapper", async () => {
    mocks.rpc.mockResolvedValue({ data: 25, error: null });

    await expect(
      enqueueDueOfficialUrlRevalidations({
        limit: 50_000,
        minAgeSeconds: 5,
      }),
    ).resolves.toBe(25);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "enqueue_due_official_url_revalidation_work",
      {
        p_limit: 500,
        p_min_age_seconds: 3_600,
      },
    );
  });
});
