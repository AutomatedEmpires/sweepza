import { describe, expect, it, vi } from "vitest";
import { createRemoteMutationSequencer } from "@/lib/remote-mutation-sequencer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createRemoteMutationSequencer", () => {
  it("runs writes in order and only applies the newest returned snapshot", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const apply = vi.fn();
    const observe = vi.fn();
    const fail = vi.fn();
    const secondOperation = vi.fn(() => second.promise);
    const sequencer = createRemoteMutationSequencer<string>();

    sequencer.enqueue(() => first.promise, {
      onObservedSuccess: observe,
      onSuccess: apply,
      onError: fail,
    });
    sequencer.enqueue(secondOperation, {
      onObservedSuccess: observe,
      onSuccess: apply,
      onError: fail,
    });
    await flushMicrotasks();

    expect(secondOperation).not.toHaveBeenCalled();

    first.resolve("stale snapshot");
    await flushMicrotasks();
    expect(apply).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith("stale snapshot");
    expect(secondOperation).toHaveBeenCalledOnce();

    second.resolve("current snapshot");
    await flushMicrotasks();
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith("current snapshot");
    expect(observe).toHaveBeenLastCalledWith("current snapshot");
    expect(observe).toHaveBeenCalledTimes(2);
    expect(fail).not.toHaveBeenCalled();
  });

  it("reports a failure only for the newest queued mutation", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const apply = vi.fn();
    const fail = vi.fn();
    const sequencer = createRemoteMutationSequencer<string>();

    sequencer.enqueue(() => first.promise, { onSuccess: apply, onError: fail });
    sequencer.enqueue(() => second.promise, { onSuccess: apply, onError: fail });

    first.reject(new Error("stale failure"));
    await flushMicrotasks();
    expect(fail).not.toHaveBeenCalled();

    const currentError = new Error("current failure");
    second.reject(currentError);
    await flushMicrotasks();
    expect(fail).toHaveBeenCalledOnce();
    expect(fail).toHaveBeenCalledWith(currentError);
    expect(apply).not.toHaveBeenCalled();
  });
});
