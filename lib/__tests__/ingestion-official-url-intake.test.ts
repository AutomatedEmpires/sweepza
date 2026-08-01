import { describe, expect, it, vi } from "vitest";
import { takeOfficialUrlIntakeLeads } from "@/lib/ingestion/official-url-intake";
import type { DiscoveryWorkQueue } from "@/lib/ingestion/source";

const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

function queueWith(
  items: Array<{
    key: string;
    payload: Record<string, unknown>;
    claimToken: string;
  }>,
) {
  const complete = vi.fn().mockResolvedValue(undefined);
  const deadLetter = vi.fn().mockResolvedValue(undefined);
  const queue: DiscoveryWorkQueue = {
    enqueue: vi.fn(),
    take: vi.fn().mockResolvedValue(items),
    complete,
    defer: vi.fn(),
    deadLetter,
  };
  return { queue, complete, deadLetter };
}

describe("takeOfficialUrlIntakeLeads", () => {
  it("maps valid durable work to attributed official leads", async () => {
    const { queue, complete } = queueWith([
      {
        key: "work-1",
        claimToken: "claim-1",
        payload: {
          kind: "admin_official_url_v1",
          officialUrl: "https://sponsor.example.com/rules",
          idempotencyKey: "partner:promotion-1",
          authority: {
            type: "sweepza_operator",
            appUserId: ACTOR_ID,
          },
        },
      },
    ]);

    const leads = await takeOfficialUrlIntakeLeads(queue, 25);

    expect(queue.take).toHaveBeenCalledWith(25);
    expect(leads).toEqual([
      {
        lead: {
          officialUrl: "https://sponsor.example.com/rules",
          discoveryWorkKey: "work-1",
          discoveryWorkClaimToken: "claim-1",
        },
        provenanceSource: `official_direct:operator:${ACTOR_ID}`,
      },
    ]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("accepts generation-specific refresh metadata without changing listing provenance", async () => {
    const requestItemKey = `admin-official:${"a".repeat(64)}`;
    const { queue, deadLetter } = queueWith([
      {
        key: `${requestItemKey}:refresh:2`,
        claimToken: "claim-refresh-2",
        payload: {
          kind: "admin_official_url_v1",
          officialUrl: "https://sponsor.example.com/rules",
          idempotencyKey: "partner:promotion-1",
          authority: {
            type: "sweepza_operator",
            appUserId: ACTOR_ID,
          },
          refresh: {
            requestItemKey,
            generation: 2,
            reason: "scheduled_revalidation",
          },
        },
      },
    ]);

    await expect(
      takeOfficialUrlIntakeLeads(queue, 25),
    ).resolves.toEqual([
      {
        lead: {
          officialUrl: "https://sponsor.example.com/rules",
          discoveryWorkKey: `${requestItemKey}:refresh:2`,
          discoveryWorkClaimToken: "claim-refresh-2",
        },
        provenanceSource: `official_direct:operator:${ACTOR_ID}`,
      },
    ]);
    expect(deadLetter).not.toHaveBeenCalled();
  });

  it("dead-letters malformed queue payloads with claim-bound diagnostics", async () => {
    const { queue, complete, deadLetter } = queueWith([
      {
        key: "bad-kind",
        claimToken: "claim-bad-kind",
        payload: {
          kind: "unknown",
          officialUrl: "https://sponsor.example.com/rules",
        },
      },
      {
        key: "bad-url",
        claimToken: "claim-bad-url",
        payload: {
          kind: "admin_official_url_v1",
          officialUrl: "http://sponsor.example.com/rules",
          idempotencyKey: "partner:promotion-2",
          authority: {
            type: "sweepza_operator",
            appUserId: ACTOR_ID,
          },
        },
      },
      {
        key: "bad-refresh",
        claimToken: "claim-bad-refresh",
        payload: {
          kind: "admin_official_url_v1",
          officialUrl: "https://sponsor.example.com/rules",
          idempotencyKey: "partner:promotion-3",
          authority: {
            type: "sweepza_operator",
            appUserId: ACTOR_ID,
          },
          refresh: {
            requestItemKey: "root",
            generation: 1,
            reason: "scheduled_revalidation",
          },
        },
      },
      {
        key: `admin-official:${"b".repeat(64)}:refresh:2`,
        claimToken: "claim-mismatched-refresh",
        payload: {
          kind: "admin_official_url_v1",
          officialUrl: "https://sponsor.example.com/rules",
          idempotencyKey: "partner:promotion-4",
          authority: {
            type: "sweepza_operator",
            appUserId: ACTOR_ID,
          },
          refresh: {
            requestItemKey: `admin-official:${"c".repeat(64)}`,
            generation: 2,
            reason: "operator_revalidation",
          },
        },
      },
    ]);

    const leads = await takeOfficialUrlIntakeLeads(queue, 25);

    expect(leads).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
    expect(deadLetter).toHaveBeenCalledTimes(4);
    expect(deadLetter).toHaveBeenNthCalledWith(
      1,
      "bad-kind",
      "claim-bad-kind",
      expect.stringContaining("invalid_official_url_intake_payload"),
    );
    expect(deadLetter).toHaveBeenNthCalledWith(
      2,
      "bad-url",
      "claim-bad-url",
      expect.stringContaining("URL must use HTTPS"),
    );
    expect(deadLetter).toHaveBeenNthCalledWith(
      3,
      "bad-refresh",
      "claim-bad-refresh",
      expect.stringContaining("greater than or equal to 2"),
    );
    expect(deadLetter).toHaveBeenNthCalledWith(
      4,
      `admin-official:${"b".repeat(64)}:refresh:2`,
      "claim-mismatched-refresh",
      expect.stringContaining(
        "refresh generation does not match the claimed queue key",
      ),
    );
  });

  it("bounds direct queue reads even if a caller supplies an excessive limit", async () => {
    const { queue } = queueWith([]);

    await takeOfficialUrlIntakeLeads(queue, 50_000);

    expect(queue.take).toHaveBeenCalledWith(500);
  });
});
