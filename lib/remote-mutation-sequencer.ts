/**
 * Serializes remote mutations and only lets the newest queued mutation apply
 * its returned snapshot. This matters when separate UI controls mutate one
 * server-owned aggregate: a slow earlier response must not replace a newer
 * optimistic state, while the server must still receive writes in user order.
 */
export function createRemoteMutationSequencer<T>() {
  let latestVersion = 0;
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue(
      operation: () => Promise<T>,
      handlers: {
        /** Receives every successful authoritative response, even when newer optimistic work is queued. */
        onObservedSuccess?: (value: T) => void;
        onSuccess: (value: T) => void;
        onError: (error: unknown) => void;
      },
    ): void {
      const version = ++latestVersion;

      tail = tail.then(async () => {
        try {
          const value = await operation();
          handlers.onObservedSuccess?.(value);
          if (version === latestVersion) handlers.onSuccess(value);
        } catch (error) {
          if (version === latestVersion) handlers.onError(error);
        }
      });
    },
  };
}
