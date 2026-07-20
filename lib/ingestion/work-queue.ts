import type { DiscoveryWorkItem, DiscoveryWorkQueue } from "@/lib/ingestion/source";

/** Deterministic queue for fixtures/tests; production uses the database port. */
export function createMemoryDiscoveryWorkQueue(): DiscoveryWorkQueue {
  const items = new Map<string, { item: DiscoveryWorkItem; completed: boolean; deferred: boolean }>();
  return {
    async enqueue(next) {
      for (const item of next) {
        const existing = items.get(item.key);
        const changed = existing
          ? JSON.stringify(existing.item.payload) !== JSON.stringify(item.payload)
          : false;
        items.set(item.key, {
          item,
          completed: changed ? false : (existing?.completed ?? false),
          deferred: changed ? false : (existing?.deferred ?? false),
        });
      }
    },
    async take(limit) {
      return [...items.values()]
        .filter((entry) => !entry.completed && !entry.deferred)
        .slice(0, Math.max(0, limit))
        .map((entry) => entry.item);
    },
    async complete(key) {
      const existing = items.get(key);
      if (existing) existing.completed = true;
    },
    async defer(key) {
      const existing = items.get(key);
      if (existing) existing.deferred = true;
    },
  };
}
