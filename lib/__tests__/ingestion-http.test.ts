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

describe("SSRF — non-public destinations", () => {
  // Official URLs come out of third-party markup. Without these, an approved
  // adapter could hand us the cloud metadata endpoint and the server would
  // fetch its own credentials. official_direct has NO allowlist, so reach
  // policy cannot be what stops this.
  const open = () => descriptor({ allowedHosts: [], allowedPathPrefixes: [] });

  it("rejects the cloud metadata endpoint and other non-public literals", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/iam/security-credentials/", // AWS/GCP IMDS
      "https://169.254.169.254/computeMetadata/v1/",
      "http://127.0.0.1:3000/admin",
      "https://10.0.0.5/internal",
      "https://192.168.1.1/router",
      "https://172.16.0.1/private",
      "https://172.31.255.255/private",
      "http://0.0.0.0:8080/",
      "https://100.64.0.1/cgnat",
      "http://localhost:5432/",
      "https://db.internal/health",
      "https://printer.local/",
      "https://[::1]:8080/",
      "https://[fe80::1]/",
      // Link-local is fe80::/10, not fe80::/16 — everything up to febf. A check
      // matching the fe80 spelling let these through as public.
      "https://[fe90::1]/",
      "https://[fea0::1]/",
      "https://[febf:ffff::1]/",
      "https://[fd00::1]/",
      "https://[::ffff:127.0.0.1]/", // IPv4-mapped loopback via v6 syntax…
      "https://[::ffff:7f00:1]/", // …and the hex form WHATWG URL normalises it to
      "https://[::ffff:a9fe:a9fe]/", // IPv4-mapped 169.254.169.254 (IMDS)
      "https://[::ffff:c0a8:1]/", // IPv4-mapped 192.168.0.1
    ]) {
      expect(isUrlAllowed(open(), url), `${url} must be refused`).toBe(false);
    }
  });

  it("still allows an IPv4-mapped PUBLIC address", () => {
    // The mapped-address handling must reject by range, not reject on sight.
    expect(isUrlAllowed(open(), "https://[::ffff:5db8:d822]/")).toBe(true); // 93.184.216.34
  });

  it("does not over-block adjacent IPv6 that is genuinely public", () => {
    // fec0::/10 was deprecated site-local and fe00:: is not link-local; the /10
    // mask must stop at febf rather than swallowing the neighbourhood.
    expect(isUrlAllowed(open(), "https://[2606:4700::1111]/")).toBe(true); // Cloudflare
    expect(isUrlAllowed(open(), "https://[2001:4860:4860::8888]/")).toBe(true); // Google
  });

  it("still allows a genuine public sponsor page", () => {
    expect(isUrlAllowed(open(), "https://sponsor.example.org/rules")).toBe(true);
    expect(isUrlAllowed(open(), "https://8.8.8.8/rules")).toBe(true); // public literal
  });

  it("requires https when the source has no allowlist to bound it", () => {
    // The lead itself is the only bound on official_direct, so cleartext to an
    // attacker-supplied host is not something reach policy can catch later.
    expect(isUrlAllowed(open(), "http://sponsor.example.org/rules")).toBe(false);
    expect(isUrlAllowed(open(), "https://sponsor.example.org/rules")).toBe(true);
  });

  it("refuses a private destination even on an allowlisted host", () => {
    // Reach and public-ness are different questions; an allowlist entry that
    // resolves somewhere private is still not a place we may go.
    const d = descriptor({ allowedHosts: ["127.0.0.1"] });
    expect(isUrlAllowed(d, "http://127.0.0.1/x")).toBe(false);
  });

  it("refuses a hostname whose DNS resolves to a private address", async () => {
    const fetchImpl = vi.fn();
    const client = createSourceHttpClient(open(), {
      fetchImpl: fetchImpl as never,
      lookupImpl: async () => ["127.0.0.1"], // the rebinding-style case
    });

    const result = await client.get("https://sponsor.example.org/rules");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("blocked_by_policy");
    expect(fetchImpl, "must refuse BEFORE the request").not.toHaveBeenCalled();
  });

  it("refuses when ANY resolved address is non-public, not just the first", async () => {
    const fetchImpl = vi.fn();
    const client = createSourceHttpClient(open(), {
      fetchImpl: fetchImpl as never,
      lookupImpl: async () => ["93.184.216.34", "169.254.169.254"],
    });

    const result = await client.get("https://sponsor.example.org/rules");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("blocked_by_policy");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("proceeds when DNS resolves entirely to public addresses", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html>rules</html>", { status: 200 }),
    );
    const client = createSourceHttpClient(open(), {
      fetchImpl: fetchImpl as never,
      lookupImpl: async () => ["93.184.216.34"],
    });

    const result = await client.get("https://sponsor.example.org/rules");

    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("redirects are re-checked, not followed blindly", () => {
  function redirectingFetch(chain: Record<string, { status: number; location?: string; body?: string }>) {
    return vi.fn(async (url: string | URL) => {
      const hop = chain[String(url)];
      if (!hop) return new Response("missing", { status: 404 });
      if (hop.location) {
        return new Response(null, { status: hop.status, headers: { location: hop.location } });
      }
      return new Response(hop.body ?? "<html>ok</html>", { status: hop.status });
    });
  }

  it("refuses a redirect that leaves the source's reach — without requesting it", async () => {
    // fetch's redirect:"follow" would have touched evil.example.net before this
    // client ever saw response.url, making the per-source boundary advisory.
    const fetchImpl = redirectingFetch({
      "https://example.com/start": { status: 302, location: "https://evil.example.net/pwn" },
    });
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.get("https://example.com/start");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("blocked_by_policy");
    expect(fetchImpl).toHaveBeenCalledOnce(); // only the first hop
    expect(fetchImpl).not.toHaveBeenCalledWith("https://evil.example.net/pwn", expect.anything());
  });

  it("refuses a redirect to the metadata endpoint", async () => {
    const fetchImpl = redirectingFetch({
      "https://example.com/start": { status: 302, location: "http://169.254.169.254/latest/" },
    });
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.get("https://example.com/start");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("blocked_by_policy");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("follows an in-reach redirect and returns the final page", async () => {
    const fetchImpl = redirectingFetch({
      "https://example.com/start": { status: 301, location: "https://example.com/real" },
      "https://example.com/real": { status: 200, body: "<html>landed</html>" },
    });
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.get("https://example.com/start");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.finalUrl).toBe("https://example.com/real");
      expect(result.body).toContain("landed");
    }
  });

  it("resolves a relative Location against the current URL", async () => {
    const fetchImpl = redirectingFetch({
      "https://example.com/a/start": { status: 302, location: "/b/end" },
      "https://example.com/b/end": { status: 200, body: "<html>end</html>" },
    });
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.get("https://example.com/a/start");

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.finalUrl).toBe("https://example.com/b/end");
  });

  it("gives up after too many hops instead of looping", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const n = Number(new URL(String(url)).searchParams.get("n") ?? "0");
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/hop?n=${n + 1}` },
      });
    });
    const client = createSourceHttpClient(descriptor({ requestBudgetPerRun: 100 }), {
      fetchImpl: fetchImpl as never,
    });

    const result = await client.get("https://example.com/hop?n=0");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("too_many_redirects");
  });

  it("resolve() REPORTS an off-reach destination without fetching it", async () => {
    // This is what /go.php is for: hand back the sponsor's URL. Fetching it here
    // would spend the discovery source's approval on a host it never covered —
    // the caller re-gates it under official_direct instead.
    const fetchImpl = redirectingFetch({
      "https://example.com/go.php?id=7": {
        status: 302,
        location: "https://sponsor.example.org/sweepstakes",
      },
    });
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.resolve("https://example.com/go.php?id=7");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.finalUrl).toBe("https://sponsor.example.org/sweepstakes");
      expect(result.body).toBe("");
    }
    expect(fetchImpl).toHaveBeenCalledOnce(); // the destination was never requested
  });

  it("resolve() refuses to report a non-public destination as an official URL", async () => {
    const fetchImpl = redirectingFetch({
      "https://example.com/go.php?id=8": { status: 302, location: "http://169.254.169.254/" },
    });
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.resolve("https://example.com/go.php?id=8");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.failure).toBe("blocked_by_policy");
  });

  it("does not mistake a 304 for a redirect", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304 }));
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.get("https://example.com/p", {
      conditional: { etag: 'W/"abc"' },
    });

    expect(result.status).toBe("not_modified");
  });
});

describe("budget and concurrency are enforced, not just declared", () => {
  it("never exceeds the request budget under concurrent calls", async () => {
    // The budget check and the increment used to be split by an await, so
    // parallel callers all saw the last slot free and all took it.
    let concurrent = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent -= 1;
      return new Response("<html>ok</html>", { status: 200 });
    });
    const client = createSourceHttpClient(
      descriptor({ requestBudgetPerRun: 3, maxConcurrency: 1 }),
      { fetchImpl: fetchImpl as never },
    );

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => client.get(`https://example.com/p${i}`)),
    );

    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(3);
    expect(client.stats().requests).toBeLessThanOrEqual(3);
    expect(results.filter((r) => r.status === "failed").length).toBeGreaterThan(0);
    for (const r of results) {
      if (r.status === "failed") expect(r.failure).toBe("budget_exhausted");
    }
  });

  it("honours maxConcurrency instead of ignoring it", async () => {
    // maxConcurrency was never read at all.
    let concurrent = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent -= 1;
      return new Response("<html>ok</html>", { status: 200 });
    });
    const client = createSourceHttpClient(
      descriptor({ requestBudgetPerRun: 50, maxConcurrency: 1 }),
      { fetchImpl: fetchImpl as never },
    );

    await Promise.all(
      Array.from({ length: 6 }, (_, i) => client.get(`https://example.com/p${i}`)),
    );

    expect(peak, "maxConcurrency: 1 means strictly sequential").toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("spaces concurrent callers by the crawl delay rather than letting them race", async () => {
    // All requests used to wait out the same lastRequestAt simultaneously, so
    // the politeness floor a source's robots review asked for evaporated.
    const waits: number[] = [];
    const client = createSourceHttpClient(
      descriptor({ crawlDelayMs: 100, requestBudgetPerRun: 10 }),
      {
        fetchImpl: (async () => new Response("<html>ok</html>", { status: 200 })) as never,
        sleepImpl: async (ms) => { waits.push(ms); },
      },
    );

    await Promise.all([
      client.get("https://example.com/a"),
      client.get("https://example.com/b"),
      client.get("https://example.com/c"),
    ]);

    // Two of the three had to wait behind a predecessor.
    expect(waits.filter((w) => w > 0).length).toBe(2);
  });

  it("reports the attempts it actually made when the budget runs out", async () => {
    // attempt was incremented BEFORE the budget check, so a single request that
    // consumed the last slot reported two attempts. Telemetry has to match the
    // network activity it audits.
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const client = createSourceHttpClient(
      descriptor({ requestBudgetPerRun: 1, maxRetries: 3, crawlDelayMs: 0 }),
      { fetchImpl: fetchImpl as never, sleepImpl: async () => {} },
    );

    const result = await client.get("https://example.com/p");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.failure).toBe("server_error");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(result.attempts, "one request was made, so one attempt").toBe(1);
    }
  });
});

describe("conditional GET is wired, not decorative", () => {
  it("sends a stored validator and saves the one it gets back", async () => {
    const store = new Map<string, { etag: string | null; lastModified: string | null }>();
    let sentIfNoneMatch: string | null = null;

    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      sentIfNoneMatch = new Headers(init?.headers ?? {}).get("if-none-match");
      return new Response("<html>fresh</html>", {
        status: 200,
        headers: { etag: 'W/"v2"' },
      });
    });

    const client = createSourceHttpClient(descriptor({ supportsConditionalRequests: true }), {
      fetchImpl: fetchImpl as never,
      fetchState: {
        async load(url) { return store.get(url) ?? null; },
        async save(url, s) { store.set(url, { etag: s.etag, lastModified: s.lastModified }); },
      },
    });

    // First pass: nothing stored, nothing sent, validator recorded.
    await client.get("https://example.com/hub");
    expect(sentIfNoneMatch).toBeNull();
    expect(store.get("https://example.com/hub")?.etag).toBe('W/"v2"');

    // Second pass: the stored validator is sent without the caller doing a thing.
    await client.get("https://example.com/hub");
    expect(sentIfNoneMatch).toBe('W/"v2"');
  });

  it("keeps the validator across a 304 and counts it", async () => {
    const store = new Map<string, { etag: string | null; lastModified: string | null }>([
      ["https://example.com/hub", { etag: 'W/"v1"', lastModified: null }],
    ]);
    const client = createSourceHttpClient(descriptor({ supportsConditionalRequests: true }), {
      fetchImpl: (async () => new Response(null, { status: 304 })) as never,
      fetchState: {
        async load(url) { return store.get(url) ?? null; },
        async save(url, s) { store.set(url, { etag: s.etag, lastModified: s.lastModified }); },
      },
    });

    const result = await client.get("https://example.com/hub");

    expect(result.status).toBe("not_modified");
    expect(client.stats().notModified).toBe(1);
    expect(store.get("https://example.com/hub")?.etag, "a 304 must not erase it").toBe('W/"v1"');
  });

  it("does not consult the store for a source that ignores validators", async () => {
    const load = vi.fn(async () => ({ etag: 'W/"x"', lastModified: null }));
    const client = createSourceHttpClient(descriptor({ supportsConditionalRequests: false }), {
      fetchImpl: (async () => new Response("<html>ok</html>", { status: 200 })) as never,
      fetchState: { load, save: async () => {} },
    });

    await client.get("https://example.com/p");

    expect(load).not.toHaveBeenCalled();
  });

  it("survives a store that throws — remembering an ETag is never worth a failed fetch", async () => {
    const client = createSourceHttpClient(descriptor({ supportsConditionalRequests: true }), {
      fetchImpl: (async () => new Response("<html>ok</html>", { status: 200 })) as never,
      fetchState: {
        async load() { throw new Error("db down"); },
        async save() { throw new Error("db down"); },
      },
    });

    const result = await client.get("https://example.com/p");

    expect(result.status).toBe("ok");
  });
});

describe("body cap bounds the read, not just the result", () => {
  it("stops reading and cancels once the cap is reached", async () => {
    let cancelled = false;
    let pulls = 0;
    const chunk = new TextEncoder().encode("x".repeat(50_000));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 200) return controller.close(); // a source that never stops
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
    const client = createSourceHttpClient(descriptor(), { fetchImpl: fetchImpl as never });

    const result = await client.get("https://example.com/huge");

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.body.length).toBe(400_000);
    // The proof: we hung up rather than draining an unbounded body into memory.
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(200);
  });
});
