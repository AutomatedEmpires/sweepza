import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, rateLimit } from "@/lib/rate-limit";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rateLimit", () => {
  it("blocks at the limit with a useful retry window", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const options = { namespace: "boundary", limit: 2, windowMs: 60_000 };

    expect(rateLimit("client-a", options)).toEqual({
      ok: true,
      retryAfterSec: 0,
    });
    expect(rateLimit("client-a", options)).toEqual({
      ok: true,
      retryAfterSec: 0,
    });
    expect(rateLimit("client-a", options)).toEqual({
      ok: false,
      retryAfterSec: 60,
    });
  });

  it("releases timestamps once the sliding window passes", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const options = { namespace: "release", limit: 1, windowMs: 60_000 };

    expect(rateLimit("client-b", options).ok).toBe(true);
    expect(rateLimit("client-b", options).ok).toBe(false);

    now.mockReturnValue(2_060_000);
    expect(rateLimit("client-b", options)).toEqual({
      ok: true,
      retryAfterSec: 0,
    });
  });

  it("keeps endpoint namespaces independent for the same client", () => {
    vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    const common = { limit: 1, windowMs: 60_000 };

    expect(
      rateLimit("client-c", { ...common, namespace: "seeker-state" }).ok,
    ).toBe(true);
    expect(
      rateLimit("client-c", { ...common, namespace: "seeker-state" }).ok,
    ).toBe(false);
    expect(
      rateLimit("client-c", { ...common, namespace: "winners" }).ok,
    ).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the edge-provided real IP", () => {
    const request = new Request("https://sweepza.com/api/winners", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.99, 192.0.2.12",
      },
    });

    expect(clientKey(request)).toBe("203.0.113.10");
  });

  it("ignores the spoofable leftmost forwarded hop", () => {
    const request = new Request("https://sweepza.com/api/winners", {
      headers: {
        "x-forwarded-for": "spoofed-client, 198.51.100.24, 192.0.2.44",
      },
    });

    expect(clientKey(request)).toBe("192.0.2.44");
  });

  it("uses a shared fallback when no trusted forwarding header exists", () => {
    expect(clientKey(new Request("http://localhost/api/winners"))).toBe(
      "unknown",
    );
  });
});
