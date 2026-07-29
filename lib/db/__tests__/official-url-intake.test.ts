import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueOfficialUrlIntakeWork: vi.fn(),
}));

vi.mock("@/lib/db/discovery-work", () => ({
  enqueueOfficialUrlIntakeWork: mocks.enqueueOfficialUrlIntakeWork,
  OfficialUrlIntakeIdempotencyConflictError: class extends Error {},
}));

import {
  enqueueOfficialUrlIntake,
  officialUrlIntakeItemKey,
} from "@/lib/db/official-url-intake";

const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueueOfficialUrlIntakeWork.mockResolvedValue(1);
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
});
