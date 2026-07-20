import { describe, expect, it } from "vitest";
import { createMemoryDiscoveryWorkQueue } from "@/lib/ingestion/work-queue";

describe("discovery work generations", () => {
  it("keeps an identical completed item closed but reopens changed payload", async () => {
    const queue = createMemoryDiscoveryWorkQueue();
    await queue.enqueue([{ key: "post-1", payload: { title: "Original" } }]);
    await queue.complete("post-1");

    await queue.enqueue([{ key: "post-1", payload: { title: "Original" } }]);
    expect(await queue.take(10)).toEqual([]);

    await queue.enqueue([{ key: "post-1", payload: { title: "Updated" } }]);
    expect(await queue.take(10)).toEqual([
      { key: "post-1", payload: { title: "Updated" } },
    ]);
  });

  it("moves deferred work aside so later items can progress", async () => {
    const queue = createMemoryDiscoveryWorkQueue();
    await queue.enqueue([
      { key: "blocked", payload: {} },
      { key: "ready", payload: {} },
    ]);
    await queue.defer("blocked");
    expect(await queue.take(1)).toEqual([{ key: "ready", payload: {} }]);
  });
});
