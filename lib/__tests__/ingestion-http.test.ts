import { describe, expect, it, vi } from "vitest";
import { createFixtureFetch, createFixtureHttpClient } from "@/lib/ingestion/fixtures/http";
import { BOT_CHALLENGE_HTML } from "@/lib/ingestion/fixtures/scenarios";
import { createSourceHttpClient, isRetryable, isUrlAllowed } from "@/lib/ingestion/http";
import type { SourceDescriptor } from "@/lib/ingestion/source";

function descriptor(overrides: Partial<SourceDescriptor> = {}): SourceDescriptor {
  return {
    id: "test_source",
    label: "Test Source",
    tier: "discovery",
    homepage: "https://example.com/",
    allowedHosts: ["example.com"],
    allowedPathPrefixes: [],
    crawlDelayMs: 0,
    requestBudgetPerRun: 10,
    maxConcurrency: 1,
    timeoutMs: 50,
    refreshIntervalMinutes: 720,
    supportsConditionalRequests: true,
    maxRetries: 2,
    failureThreshold: 3,
    complianceState: "approved_for_fixtures",
    robotsPosture: "permissive",
    tosPosture: "unreviewed",
    attribution: null,
    dataRetentionDays: 90,
    killSwitch: false,
    buildPriority: 99,
    notes: "",
    ...overrides,
  };
}

describe("isUrlAllowed", () => {
  const d = descriptor({ allowedHosts: ["example.com"], allowedPathPrefixes: ["/listings"] });

  it("allows the declared host and path prefix", () => {
    expect(isUrlAllowed(d, "https://example.com/listings/page-1")).toBe(true);
    expect(isUrlAllowed(d, "https://www.example.com/listings")).toBe(true);
    expect(isUrlAllowed(d, "https://cdn.example.com/listings/x")).toBe(true);
  });

  it("refuses other hosts, other paths, and non-http schemes", () => {
    expect(isUrlAllowed(d, "https://evil.example.net/listings")).toBe(false);
    expect(isUrlAllowed(d, "https://example.com/admin")).toBe(false);
    expect(isUrlAllowed(d, "file:///etc/passwd")).toBe(false);
    expect(isUrlAllowed(d, "javascript:alert(1)")).toBe(false);
    expect(isUrlAllowed(d, "not a url")).toBe(false);
  });

  it("is not fooled by a lookalike host suffix", () => {
    // notexample.com must not satisfy an example.com allowlist.
    expect(isUrlAllowed(d, "https://notexample.com/listings")).toBe(false);
  });

  it("treats an empty allowlist as unbounded (official_direct)", () => {
    const open = descriptor({ allowedHosts: [], allowedPathPrefixes: [] });
    expect(isUrlAllowed(open, "https://any-sponsor.example.org/rules")).toBe(true);
    expect(isUrlAllowed(open, "ftp://sponsor.example.org/rules")).toBe(false);
  });
});

describe("policy client — reach", () => {
  it("refuses an off-allowlist URL without making a request", async () => {
    const fetchImpl = vi.fn();
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.get("https://somewhere-else.example.net/page");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("blocked_by_policy");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("policy client — failure classification", () => {
  it.each([
    [404, "not_found"],
    [410, "not_found"],
    [401, "access_denied"],
    [429, "rate_limited"],
    [500, "server_error"],
    [503, "server_error"],
  ])("classifies HTTP %i as %s", async (status, expected) => {
    const client = createFixtureHttpClient(descriptor({ maxRetries: 0 }), {
      "https://example.com/p": { status, body: "nope" },
    });
    const result = await client.get("https://example.com/p");
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe(expected);
  });

  it("distinguishes a bot challenge from a genuine access denial", async () => {
    const challenge = createFixtureHttpClient(descriptor({ maxRetries: 0 }), {
      "https://example.com/p": { status: 403, body: BOT_CHALLENGE_HTML },
    });
    const denied = createFixtureHttpClient(descriptor({ maxRetries: 0 }), {
      "https://example.com/p": { status: 403, body: "<h1>Forbidden</h1>" },
    });

    const a = await challenge.get("https://example.com/p");
    const b = await denied.get("https://example.com/p");

    expect(a.status === "failed" && a.failure).toBe("bot_challenge");
    expect(b.status === "failed" && b.failure).toBe("access_denied");
  });

  it("classifies a transport error as network", async () => {
    const client = createFixtureHttpClient(descriptor({ maxRetries: 0 }), {
      "https://example.com/p": { networkError: "getaddrinfo ENOTFOUND" },
    });
    const result = await client.get("https://example.com/p");
    expect(result.status === "failed" && result.failure).toBe("network");
  });

  it("classifies a hung request as timeout", async () => {
    const client = createFixtureHttpClient(descriptor({ maxRetries: 0, timeoutMs: 20 }), {
      "https://example.com/p": { hang: true },
    });
    const result = await client.get("https://example.com/p");
    expect(result.status === "failed" && result.failure).toBe("timeout");
  });

  it("classifies a 200 with an empty body as empty_body, not success", async () => {
    const client = createFixtureHttpClient(descriptor({ maxRetries: 0 }), {
      "https://example.com/p": { body: "   " },
    });
    const result = await client.get("https://example.com/p");
    expect(result.status === "failed" && result.failure).toBe("empty_body");
  });

  it("retries only what is worth retrying", () => {
    expect(isRetryable("timeout")).toBe(true);
    expect(isRetryable("network")).toBe(true);
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("server_error")).toBe(true);
    // Facts, not blips — retrying these just hammers the source.
    expect(isRetryable("not_found")).toBe(false);
    expect(isRetryable("access_denied")).toBe(false);
    expect(isRetryable("bot_challenge")).toBe(false);
    expect(isRetryable("blocked_by_policy")).toBe(false);
  });
});

describe("policy client — retries and budget", () => {
  it("retries a server error up to maxRetries, then reports the attempts", async () => {
    const log: string[] = [];
    const client = createFixtureHttpClient(
      descriptor({ maxRetries: 2 }),
      { "https://example.com/p": { status: 500, body: "boom" } },
      { log },
    );

    const result = await client.get("https://example.com/p");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.attempts).toBe(3);
    expect(log).toHaveLength(3); // initial + 2 retries
  });

  it("does not retry a 404", async () => {
    const log: string[] = [];
    const client = createFixtureHttpClient(
      descriptor({ maxRetries: 2 }),
      { "https://example.com/p": { status: 404 } },
      { log },
    );

    await client.get("https://example.com/p");

    expect(log).toHaveLength(1);
  });

  it("stops at the request budget instead of crawling forever", async () => {
    const log: string[] = [];
    const pages = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`https://example.com/p${i}`, { body: "ok" }]),
    );
    const client = createFixtureHttpClient(descriptor({ requestBudgetPerRun: 3 }), pages, { log });

    const results = [];
    for (let i = 0; i < 10; i += 1) results.push(await client.get(`https://example.com/p${i}`));

    expect(log).toHaveLength(3);
    expect(results.filter((r) => r.status === "ok")).toHaveLength(3);
    const exhausted = results.filter(
      (r) => r.status === "failed" && r.failure === "budget_exhausted",
    );
    expect(exhausted).toHaveLength(7);
    expect(client.stats()).toMatchObject({ requests: 3, budget: 3 });
  });
});

describe("policy client — crawl delay", () => {
  it("waits the descriptor's crawl delay between requests", async () => {
    const slept: number[] = [];
    const client = createSourceHttpClient(descriptor({ crawlDelayMs: 10_000 }), {
      fetchImpl: createFixtureFetch({
        "https://example.com/a": { body: "a" },
        "https://example.com/b": { body: "b" },
      }),
      sleepImpl: async (ms) => {
        slept.push(ms);
      },
    });

    await client.get("https://example.com/a");
    await client.get("https://example.com/b");

    // No wait before the first request; the Freebie Guy's 10s delay before the second.
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(9000);
    expect(slept[0]).toBeLessThanOrEqual(10_000);
  });
});

describe("policy client — conditional requests", () => {
  const pages = {
    "https://example.com/p": {
      body: "<html>content</html>",
      headers: { etag: 'W/"abc123"', "last-modified": "Wed, 15 Jul 2026 10:00:00 GMT" },
    },
  };

  it("returns not_modified when the source validates our ETag", async () => {
    const client = createFixtureHttpClient(descriptor(), pages, { honorConditional: true });

    const result = await client.get("https://example.com/p", {
      conditional: { etag: 'W/"abc123"' },
    });

    expect(result.status).toBe("not_modified");
    expect(client.stats().notModified).toBe(1);
  });

  it("returns the body when the validator no longer matches", async () => {
    const client = createFixtureHttpClient(descriptor(), pages, { honorConditional: true });

    const result = await client.get("https://example.com/p", {
      conditional: { etag: 'W/"stale"' },
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.etag).toBe('W/"abc123"');
  });

  it("surfaces validators on a fresh fetch so the caller can store them", async () => {
    const client = createFixtureHttpClient(descriptor(), pages);
    const result = await client.get("https://example.com/p");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.etag).toBe('W/"abc123"');
      expect(result.lastModified).toBe("Wed, 15 Jul 2026 10:00:00 GMT");
    }
  });

  it("does not send validators to a source that ignores them", async () => {
    let sent: Headers | undefined;
    const client = createSourceHttpClient(
      descriptor({ supportsConditionalRequests: false }),
      {
        fetchImpl: (async (_url: string, init?: RequestInit) => {
          sent = new Headers(init?.headers ?? {});
          return new Response("ok");
        }) as unknown as typeof fetch,
        sleepImpl: async () => {},
      },
    );

    await client.get("https://example.com/p", { conditional: { etag: 'W/"abc"' } });

    expect(sent?.get("if-none-match")).toBeNull();
  });
});
