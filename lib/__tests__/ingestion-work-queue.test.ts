import { describe, expect, it } from "vitest";
import { createMemoryDiscoveryWorkQueue } from "@/lib/ingestion/work-queue";

describe("discovery work generations", () => {
  it("keeps an identical completed item closed but reopens changed payload", async () => {
    const queue = createMemoryDiscoveryWorkQueue();
    await queue.enqueue([{ key: "post-1", payload: { title: "Original" } }]);
    const [original] = await queue.take(1);
    await queue.complete("post-1", original.claimToken);

    await queue.enqueue([{ key: "post-1", payload: { title: "Original" } }]);
    expect(await queue.take(10)).toEqual([]);

    await queue.enqueue([{ key: "post-1", payload: { title: "Updated" } }]);
    expect(await queue.take(10)).toEqual([
      expect.objectContaining({
        key: "post-1",
        payload: { title: "Updated" },
        claimToken: expect.any(String),
      }),
    ]);
  });

  it("moves deferred work aside so later items can progress", async () => {
    const queue = createMemoryDiscoveryWorkQueue();
    await queue.enqueue([
      { key: "blocked", payload: {} },
      { key: "ready", payload: {} },
    ]);
    const [blocked] = await queue.take(1);
    await queue.defer("blocked", blocked.claimToken);
    expect(await queue.take(1)).toEqual([
      expect.objectContaining({ key: "ready", payload: {} }),
    ]);
  });

  it("rejects a stale completion after changed payload invalidates the claim", async () => {
    const queue = createMemoryDiscoveryWorkQueue();
    await queue.enqueue([{ key: "post-1", payload: { title: "Original" } }]);
    const [stale] = await queue.take(1);

    await queue.enqueue([{ key: "post-1", payload: { title: "Corrected" } }]);

    await expect(
      queue.complete(stale.key, stale.claimToken),
    ).rejects.toThrow('discovery work claim lost for "post-1"');
    const [corrected] = await queue.take(1);
    expect(corrected).toEqual(
      expect.objectContaining({
        key: "post-1",
        payload: { title: "Corrected" },
      }),
    );
    expect(corrected.claimToken).not.toBe(stale.claimToken);
  });
});
