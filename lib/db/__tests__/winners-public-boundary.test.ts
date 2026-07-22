import { beforeEach, describe, expect, it, vi } from "vitest";

interface RecordedCall {
  method: string;
  args: unknown[];
}

function createClientRecorder(result: unknown) {
  const calls: RecordedCall[] = [];
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return proxy;
        };
      },
    },
  );
  return { proxy, calls };
}

const state = vi.hoisted(() => ({
  recorder: null as null | { proxy: unknown; calls: RecordedCall[] },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => state.recorder!.proxy,
  createServiceRoleClient: () => state.recorder!.proxy,
}));

import { getPublishedWinnerPosts } from "@/lib/db/winners";

function hasCall(method: string, ...args: unknown[]) {
  return state.recorder!.calls.some(
    (call) =>
      call.method === method &&
      args.every((argument, index) => call.args[index] === argument),
  );
}

describe("winner feed public listing boundary", () => {
  beforeEach(() => {
    state.recorder = createClientRecorder({ data: [], error: null });
  });

  it("only exposes posts attached to currently public, reviewed listings", async () => {
    await getPublishedWinnerPosts();

    const select = state.recorder!.calls.find((call) => call.method === "select");
    expect(select?.args[0]).toContain("listing:listing!inner");
    expect(hasCall("eq", "review_status", "published")).toBe(true);
    expect(hasCall("eq", "listing.visibility_status", "public")).toBe(true);
    expect(hasCall("eq", "listing.lifecycle_status", "active")).toBe(true);
    expect(hasCall("gte", "listing.end_date")).toBe(true);
    expect(
      hasCall(
        "not",
        "listing.moderation_status",
        "in",
        '("under_review","action_taken")',
      ),
    ).toBe(true);

    const reviewFilter = state.recorder!.calls.find(
      (call) =>
        call.method === "in" &&
        call.args[0] === "listing.listing_verification_status",
    );
    expect(reviewFilter?.args[1]).toEqual(["reviewed", "verified"]);
  });
});
