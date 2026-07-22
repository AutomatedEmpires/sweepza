import { createSourceHttpClient, type SourceHttpClient } from "@/lib/ingestion/http";
import type { SourceDescriptor } from "@/lib/ingestion/source";

// Fixture transport for adapter development, CI, and dry runs.
//
// It substitutes the NETWORK only — not the policy. A fixture client is a real
// `createSourceHttpClient` with a canned `fetch` underneath, so a fixture run
// still enforces the host allowlist, the request budget, the retry rules, and
// conditional GET. A harness that stubbed the whole client would happily "pass"
// for an adapter that fetches a forbidden host; this one fails, which is the
// entire point of testing against it.

export interface FixturePage {
  body?: BodyInit | null;
  status?: number;
  headers?: Record<string, string>;
  /**
   * This URL redirects here — modeled as a real 3xx + `Location`, which is what
   * a server actually sends. (It used to fake `response.url`, which only worked
   * while the client let fetch follow redirects for it.)
   */
  finalUrl?: string;
  /** Reject the request at the transport layer, e.g. a DNS or socket error. */
  networkError?: string;
  /** Never settle — exercises the per-request timeout. */
  hang?: boolean;
}

export type FixturePages = Record<string, FixturePage>;

export interface FixtureFetchOptions {
  /**
   * Serve 304 when the request carries a validator matching the page's ETag or
   * Last-Modified. Off by default so a test opts into conditional behavior
   * explicitly.
   */
  honorConditional?: boolean;
  /** Records every requested URL in order, for asserting crawl behavior. */
  log?: string[];
}

function matchPage(pages: FixturePages, url: string): FixturePage | undefined {
  if (pages[url]) return pages[url];
  // Tolerate trailing-slash and query-order noise the way a real server would.
  const stripped = url.replace(/\/$/, "");
  return pages[stripped] ?? pages[`${stripped}/`];
}

/**
 * Build a `fetch` implementation that serves recorded pages. Unknown URLs 404 —
 * an adapter that wanders off its fixture set gets a real, classified failure
 * rather than a silent undefined.
 */
export function createFixtureFetch(
  pages: FixturePages,
  options: FixtureFetchOptions = {},
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    options.log?.push(url);

    const page = matchPage(pages, url);
    if (!page) {
      return new Response("not found", { status: 404 });
    }
    if (page.networkError) {
      throw new TypeError(page.networkError);
    }
    if (page.hang) {
      // Settle only when the caller's timeout aborts, mirroring a dead socket.
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }

    const headers = new Headers(page.headers ?? {});

    if (options.honorConditional) {
      const requestHeaders = new Headers(init?.headers ?? {});
      const ifNoneMatch = requestHeaders.get("if-none-match");
      const ifModifiedSince = requestHeaders.get("if-modified-since");
      const etag = headers.get("etag");
      const lastModified = headers.get("last-modified");
      if (
        (ifNoneMatch && etag && ifNoneMatch === etag) ||
        (ifModifiedSince && lastModified && ifModifiedSince === lastModified)
      ) {
        return new Response(null, { status: 304, headers });
      }
    }

    // A redirect on the wire is a 3xx carrying Location. This used to fake
    // `response.url` instead, which modeled fetch's redirect:"follow" rather
    // than the server — so the fixture kept passing while the client silently
    // chased Locations off-allowlist. The client now walks hops itself and
    // re-guards each one, so the fixture has to speak the same protocol.
    if (page.finalUrl) {
      headers.set("location", page.finalUrl);
      return new Response(null, { status: page.status ?? 302, headers });
    }

    const status = page.status ?? 200;
    return new Response(status === 204 || status === 205 || status === 304 ? null : (page.body ?? ""), {
      status,
      headers,
    });
  }) as typeof fetch;
}

/**
 * A policy-enforcing client backed by fixtures, with crawl delays collapsed to
 * zero. Real delays would make a Freebie Guy test (10s between requests) take
 * minutes; the delay LOGIC is asserted separately against a fake clock.
 */
export function createFixtureHttpClient(
  descriptor: SourceDescriptor,
  pages: FixturePages,
  options: FixtureFetchOptions = {},
): SourceHttpClient {
  return createSourceHttpClient(descriptor, {
    fetchImpl: createFixtureFetch(pages, options),
    sleepImpl: async () => {},
  });
}
