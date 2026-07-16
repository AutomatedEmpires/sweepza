import type { SourceDescriptor } from "@/lib/ingestion/source";

// The only way an adapter is allowed to touch the network. Every control that
// keeps ingestion polite, bounded, and reversible lives here rather than in the
// adapters: host allowlist, crawl delay, per-run request budget, timeout,
// retry classification, backoff, and conditional GET. Adapters receive an
// instance via AdapterContext and cannot reach around it.
//
// Failures are CLASSIFIED, not collapsed into "it broke". The difference
// between "the sponsor took the page down" (dead link → review) and "the CDN
// hiccuped" (transient → retry) is the difference between wrongly burying a
// live sweepstakes and correctly catching an expired one, so the taxonomy is
// part of the contract and is what downstream lifecycle handling keys on.

/**
 * Why a request did not yield a usable body. `bot_challenge` is deliberately
 * distinct from `access_denied`: a 403 from an anti-bot interstitial means our
 * crawl posture is being rejected (back off, tell an operator), while a 401/403
 * from the origin means the page is genuinely not public (a real listing signal).
 */
export type FetchFailureClass =
  | "blocked_by_policy"
  | "timeout"
  | "network"
  | "not_found"
  | "access_denied"
  | "bot_challenge"
  | "rate_limited"
  | "server_error"
  | "too_many_redirects"
  | "budget_exhausted"
  | "empty_body";

/** Failure classes worth retrying — everything else is a fact, not a blip. */
const RETRYABLE: ReadonlySet<FetchFailureClass> = new Set<FetchFailureClass>([
  "timeout",
  "network",
  "rate_limited",
  "server_error",
]);

export function isRetryable(failure: FetchFailureClass): boolean {
  return RETRYABLE.has(failure);
}

export interface ConditionalState {
  etag?: string | null;
  lastModified?: string | null;
}

export type SourceFetchResult =
  | {
      status: "ok";
      url: string;
      /** Final URL after redirects — how an official link is resolved. */
      finalUrl: string;
      body: string;
      etag: string | null;
      lastModified: string | null;
      httpStatus: number;
    }
  | {
      /** The source told us nothing changed; skip extraction entirely. */
      status: "not_modified";
      url: string;
      finalUrl: string;
      httpStatus: 304;
    }
  | {
      status: "failed";
      url: string;
      failure: FetchFailureClass;
      httpStatus: number | null;
      /** Attempts actually made, including the first. */
      attempts: number;
      message: string;
    };

export interface HttpClientStats {
  requests: number;
  budget: number;
  notModified: number;
  failures: number;
}

export interface SourceHttpClient {
  /**
   * Fetch a URL under this source's policy. Never throws for an HTTP or network
   * problem — those come back as a classified `failed` result, because a
   * thrown exception loses the classification the caller needs.
   */
  get(url: string, options?: { conditional?: ConditionalState }): Promise<SourceFetchResult>;
  /** Resolve a redirect chain to its destination without reading the body. */
  resolve(url: string): Promise<SourceFetchResult>;
  stats(): HttpClientStats;
}

export interface HttpClientOptions {
  /** Injected for tests/dry runs; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected so tests don't actually wait out a 10-second crawl delay. */
  sleepImpl?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  /** Identify ourselves honestly; a source may block us by this string. */
  userAgent?: string;
}

export const SWEEPZA_USER_AGENT =
  "Mozilla/5.0 (compatible; SweepzaBot/0.1; +https://sweepza.com/bot)";

const MAX_BODY_CHARS = 400_000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Is this URL inside the source's declared reach? A source that has been
 * approved to crawl a sweepstakes directory has NOT thereby been approved to
 * crawl the whole internet from that directory's links — discovery adapters
 * must stay on their own hosts, and the pipeline fetches official pages under
 * the separate `official_direct` policy.
 */
export function isUrlAllowed(descriptor: SourceDescriptor, rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  // An empty allowlist means "no fixed reach" (official_direct): any public
  // https URL is in scope, because the lead itself is the bound.
  if (descriptor.allowedHosts.length === 0) return true;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const hostOk = descriptor.allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  if (!hostOk) return false;

  if (descriptor.allowedPathPrefixes.length === 0) return true;
  return descriptor.allowedPathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
}

function classifyStatus(status: number, body: string | null): FetchFailureClass | null {
  if (status >= 200 && status < 300) return null;
  if (status === 304) return null;
  if (status === 404 || status === 410) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 401) return "access_denied";
  if (status === 403) {
    // A 403 carrying an interstitial is an anti-bot challenge, not a private
    // page. Cloudflare/Akamai/PerimeterX signatures are the reliable tell.
    if (body && /cf-browser-verification|cf_chl|just a moment|attention required|perimeterx|_px|akamai|captcha/i.test(body)) {
      return "bot_challenge";
    }
    return "access_denied";
  }
  if (status >= 500) return "server_error";
  return "server_error";
}

function classifyError(error: unknown): FetchFailureClass {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "AbortError" || name === "TimeoutError" || /timed? ?out/i.test(message)) {
    return "timeout";
  }
  return "network";
}

/**
 * Build the network client for one source's pass. The client is stateful by
 * design: crawl delay and request budget only mean anything when they span the
 * whole pass, so one client per source per run.
 */
export function createSourceHttpClient(
  descriptor: SourceDescriptor,
  options: HttpClientOptions = {},
): SourceHttpClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const userAgent = options.userAgent ?? SWEEPZA_USER_AGENT;

  let requests = 0;
  let notModified = 0;
  let failures = 0;
  let lastRequestAt = 0;

  async function respectCrawlDelay(): Promise<void> {
    if (lastRequestAt === 0) return;
    const elapsed = Date.now() - lastRequestAt;
    const wait = descriptor.crawlDelayMs - elapsed;
    if (wait > 0) await sleep(wait);
  }

  async function once(
    url: string,
    init: RequestInit,
    readBody: boolean,
  ): Promise<SourceFetchResult> {
    await respectCrawlDelay();

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), descriptor.timeoutMs);
    // The caller's signal and our timeout both need to cancel this request;
    // AbortSignal.any composes them without leaking either.
    const signals = [timeout.signal, options.signal, (init as { signal?: AbortSignal }).signal]
      .filter((s): s is AbortSignal => Boolean(s));

    try {
      requests += 1;
      lastRequestAt = Date.now();
      const response = await fetchImpl(url, {
        ...init,
        headers: { "User-Agent": userAgent, ...(init.headers ?? {}) },
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      });

      if (response.status === 304) {
        notModified += 1;
        return { status: "not_modified", url, finalUrl: response.url || url, httpStatus: 304 };
      }

      const body = readBody ? (await response.text()).slice(0, MAX_BODY_CHARS) : null;
      const failure = classifyStatus(response.status, body);
      if (failure) {
        failures += 1;
        return {
          status: "failed",
          url,
          failure,
          httpStatus: response.status,
          attempts: 1,
          message: `GET ${url} -> ${response.status}`,
        };
      }

      if (readBody && (!body || body.trim().length === 0)) {
        failures += 1;
        return {
          status: "failed",
          url,
          failure: "empty_body",
          httpStatus: response.status,
          attempts: 1,
          message: `GET ${url} -> ${response.status} with an empty body`,
        };
      }

      return {
        status: "ok",
        url,
        finalUrl: response.url || url,
        body: body ?? "",
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        httpStatus: response.status,
      };
    } catch (error) {
      failures += 1;
      return {
        status: "failed",
        url,
        failure: classifyError(error),
        httpStatus: null,
        attempts: 1,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function withRetries(
    url: string,
    init: RequestInit,
    readBody: boolean,
  ): Promise<SourceFetchResult> {
    let attempt = 0;
    let last: SourceFetchResult = await once(url, init, readBody);
    while (
      last.status === "failed" &&
      isRetryable(last.failure) &&
      attempt < descriptor.maxRetries
    ) {
      attempt += 1;
      if (requests >= descriptor.requestBudgetPerRun) break;
      // Exponential backoff on top of the crawl delay: a struggling source gets
      // less traffic from us, not the same traffic repeated.
      await sleep(descriptor.crawlDelayMs * 2 ** attempt);
      last = await once(url, init, readBody);
    }
    if (last.status === "failed") return { ...last, attempts: attempt + 1 };
    return last;
  }

  function guard(url: string): SourceFetchResult | null {
    if (!isUrlAllowed(descriptor, url)) {
      failures += 1;
      return {
        status: "failed",
        url,
        failure: "blocked_by_policy",
        httpStatus: null,
        attempts: 0,
        message: `${url} is outside the declared reach of source "${descriptor.id}"`,
      };
    }
    if (requests >= descriptor.requestBudgetPerRun) {
      return {
        status: "failed",
        url,
        failure: "budget_exhausted",
        httpStatus: null,
        attempts: 0,
        message: `source "${descriptor.id}" exhausted its ${descriptor.requestBudgetPerRun}-request budget`,
      };
    }
    return null;
  }

  return {
    async get(url, getOptions) {
      const blocked = guard(url);
      if (blocked) return blocked;

      const headers: Record<string, string> = {};
      const conditional = getOptions?.conditional;
      // Only send validators to sources that actually honor them; a source that
      // ignores If-None-Match would return 200 forever and the header is noise.
      if (descriptor.supportsConditionalRequests && conditional) {
        if (conditional.etag) headers["If-None-Match"] = conditional.etag;
        if (conditional.lastModified) headers["If-Modified-Since"] = conditional.lastModified;
      }
      return withRetries(url, { headers, redirect: "follow" }, true);
    },

    async resolve(url) {
      const blocked = guard(url);
      if (blocked) return blocked;
      return withRetries(url, { redirect: "follow" }, false);
    },

    stats() {
      return { requests, budget: descriptor.requestBudgetPerRun, notModified, failures };
    },
  };
}
