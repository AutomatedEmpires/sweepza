import { beforeEach, describe, expect, it, vi } from "vitest";

// The public trust promise "every listing reviewed before it goes live"
// (lib/trust-copy.ts, FAQ) is enforced at the serving boundary: these tests
// pin the listing_verification_status filter onto both public front doors so
// the claim cannot silently drift away from the code that backs it.

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Chainable, awaitable Supabase query recorder: every method call is logged
// and returns the same proxy; awaiting it (at any depth) resolves `result`.
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

import { getListingBySlug, getPublicListings } from "@/lib/db/listings";

function reviewStatusFilters(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter(
    (call) =>
      call.method === "in" && call.args[0] === "listing_verification_status",
  );
}

describe("public serving boundary", () => {
  beforeEach(() => {
    state.recorder = createClientRecorder({ data: [], error: null });
  });

  it("getPublicListings only serves reviewed/verified rows", async () => {
    await getPublicListings();
    const filters = reviewStatusFilters(state.recorder!.calls);
    expect(filters.length).toBeGreaterThanOrEqual(1);
    expect(filters[0].args[1]).toEqual(["reviewed", "verified"]);
  });

  it("getListingBySlug only resolves reviewed/verified rows", async () => {
    state.recorder = createClientRecorder({ data: null, error: null });
    const listing = await getListingBySlug("some-slug");
    expect(listing).toBeNull();
    const filters = reviewStatusFilters(state.recorder!.calls);
    expect(filters.length).toBeGreaterThanOrEqual(1);
    expect(filters[0].args[1]).toEqual(["reviewed", "verified"]);
  });
});
