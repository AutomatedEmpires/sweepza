import type { DiscoveryWorkItem, DiscoveryWorkQueue } from "@/lib/ingestion/source";

/** Deterministic queue for fixtures/tests; production uses the database port. */
export function createMemoryDiscoveryWorkQueue(): DiscoveryWorkQueue {
  const items = new Map<
    string,
    {
      item: DiscoveryWorkItem;
      completed: boolean;
      deferred: boolean;
      claimToken: string | null;
      deadLetterReason: string | null;
      lastFailureReason: string | null;
    }
  >();
  let claimSequence = 0;

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
          claimToken: changed ? null : (existing?.claimToken ?? null),
          deadLetterReason: changed
            ? null
            : (existing?.deadLetterReason ?? null),
          lastFailureReason: changed
            ? null
            : (existing?.lastFailureReason ?? null),
        });
      }
    },
    async take(limit) {
      return [...items.values()]
        .filter(
          (entry) =>
            !entry.completed && !entry.deferred && entry.claimToken === null,
        )
        .slice(0, Math.max(0, limit))
        .map((entry) => {
          claimSequence += 1;
          entry.claimToken = `memory-claim-${claimSequence}`;
          return {
            ...entry.item,
            claimToken: entry.claimToken,
          };
        });
    },
    async complete(key, claimToken) {
      const existing = items.get(key);
      if (!existing || existing.claimToken !== claimToken) {
        throw new Error(`discovery work claim lost for "${key}"`);
      }
      existing.completed = true;
      existing.claimToken = null;
      existing.lastFailureReason = null;
    },
    async defer(key, claimToken, reason) {
      const existing = items.get(key);
      if (!existing || existing.claimToken !== claimToken) {
        throw new Error(`discovery work claim lost for "${key}"`);
      }
      existing.deferred = true;
      existing.claimToken = null;
      existing.lastFailureReason = reason.slice(0, 1000);
    },
    async deadLetter(key, claimToken, reason) {
      const existing = items.get(key);
      if (!existing || existing.claimToken !== claimToken) {
        throw new Error(`discovery work claim lost for "${key}"`);
      }
      existing.completed = true;
      existing.claimToken = null;
      existing.deadLetterReason = reason.slice(0, 1000);
      existing.lastFailureReason = null;
    },
  };
}
