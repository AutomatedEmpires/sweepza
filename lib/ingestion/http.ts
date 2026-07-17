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

/** Resolve a hostname to its IP addresses. Injectable so tests stay offline. */
export type HostLookup = (hostname: string) => Promise<string[]>;

/**
 * Persistence for conditional-GET validators, injected as a port so this module
 * never imports the database (and stays testable with a fake).
 *
 * Without it, `supportsConditionalRequests` was decoration: nothing loaded an
 * ETag, nothing saved one, `source_fetch_state` stayed empty and `not_modified`
 * was always zero — so every pass re-downloaded pages the source would happily
 * have told us were unchanged. Wiring it HERE rather than in each adapter means
 * the hub/index fetches get it too, which is where it actually pays: those are
 * re-fetched on every single run.
 */
export interface FetchStatePort {
  load(url: string): Promise<ConditionalState | null>;
  save(
    url: string,
    state: {
      etag: string | null;
      lastModified: string | null;
      httpStatus: number;
      notModified: boolean;
    },
  ): Promise<void>;
}

export interface HttpClientOptions {
  /** Injected for tests/dry runs; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected so tests don't actually wait out a 10-second crawl delay. */
  sleepImpl?: (ms: number) => Promise<void>;
  /**
   * DNS resolver backing the SSRF guard. Defaults to node:dns when this client
   * talks to the real network. A caller that injects `fetchImpl` is running
   * against fixtures and never leaves the process, so DNS defaults OFF there:
   * resolving invented hostnames would only make CI depend on the network. Pass
   * one explicitly to exercise the guard with a fake fetch.
   */
  lookupImpl?: HostLookup | null;
  /** Loads/stores conditional-GET validators. Omitted → no conditional GET. */
  fetchState?: FetchStatePort;
  signal?: AbortSignal;
  /** Identify ourselves honestly; a source may block us by this string. */
  userAgent?: string;
}

export const SWEEPZA_USER_AGENT =
  "Mozilla/5.0 (compatible; SweepzaBot/0.1; +https://sweepza.com/bot)";

const MAX_BODY_CHARS = 400_000;
/** Redirect hops permitted per request; each one is re-checked, not trusted. */
const MAX_REDIRECTS = 5;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- SSRF: destinations the server must never be talked into requesting -----
//
// Official URLs come out of third-party markup. Without this, an approved
// adapter could hand us http://169.254.169.254/latest/meta-data/ and the server
// would dutifully fetch its own cloud credentials. Reach policy (allowlists)
// answers "is this source allowed here?"; it says nothing about whether the
// destination is a public host, and official_direct has no allowlist at all.
//
// Two layers, because either alone is porous:
//   1. LITERAL — reject non-public IP literals syntactically. Pure and sync, so
//      isUrlAllowed stays a pure function.
//   2. RESOLVED — resolve DNS and reject if ANY address is non-public. Catches
//      metadata.google.internal and any hostname pointed at 127.0.0.1.
//
// Known limit: this does not defeat DNS rebinding (the address can change
// between our check and fetch's own resolution). Closing that needs connection
// -level pinning via a custom agent; out of scope here and recorded in the PR.

function isPublicIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const o = m.slice(1, 5).map(Number);
  if (o.some((n) => n > 255)) return false; // malformed → refuse, don't guess
  const [a, b] = o;
  if (a === 0) return false; //            0.0.0.0/8      this host
  if (a === 10) return false; //           10/8           RFC1918
  if (a === 127) return false; //          127/8          loopback
  if (a === 169 && b === 254) return false; // 169.254/16 link-local + IMDS
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12 RFC1918
  if (a === 192 && b === 168) return false; // 192.168/16 RFC1918
  if (a === 192 && b === 0) return false; //  192.0.0/24  IETF protocol
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18/15 benchmark
  if (a >= 224) return false; //           224/4 multicast, 240/4 reserved, broadcast
  return true;
}

function isPublicIPv6(raw: string): boolean {
  const s = raw.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (s === "::1" || s === "::") return false; // loopback / unspecified
  if (s.startsWith("fe80")) return false; //     link-local
  if (/^f[cd]/.test(s)) return false; //         fc00::/7 unique-local
  if (s.startsWith("ff")) return false; //       multicast

  // IPv4-mapped addresses smuggle the v4 ranges through v6 syntax, and BOTH
  // spellings must be handled. WHATWG URL normalises ::ffff:127.0.0.1 to
  // ::ffff:7f00:1, so a check that only matches the dotted form — the one a
  // human writes — lets loopback straight through. A test here proved it.
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (dotted) return isPublicIPv4(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
  if (hex) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    return isPublicIPv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  return true;
}

/** Is this address literal routable on the public internet? */
export function isPublicAddress(ip: string): boolean {
  return ip.includes(":") ? isPublicIPv6(ip) : isPublicIPv4(ip);
}

/**
 * Reject a hostname that is *written* as a non-public address. Pure — the DNS
 * half runs in the client, where it can be async and injected.
 */
export function isPublicHostLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "");
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (isIpLiteral) return isPublicAddress(host);
  // Bare/localhost-ish names never denote a public sponsor page.
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    return false;
  }
  return true;
}

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

  // SSRF floor, asked BEFORE any reach question: a non-public destination is
  // out of scope for every source, allowlisted or not. Reach policy answers
  // "may this source go there?", which is a different question from "is that a
  // real place on the internet?".
  if (!isPublicHostLiteral(url.hostname)) return false;

  // An empty allowlist means "no fixed reach" (official_direct): the lead itself
  // is the bound. That makes the destination checks matter MORE, not less — the
  // URL came out of somebody else's markup. The comment here used to promise
  // "any public https URL"; the code enforced neither half, so it does now.
  if (descriptor.allowedHosts.length === 0) return url.protocol === "https:";

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

/** One hop: either a terminal result, or a Location to re-guard and follow. */
type Hop =
  | { kind: "result"; result: SourceFetchResult }
  | { kind: "redirect"; location: string; httpStatus: number };

/**
 * Real DNS, imported lazily so this module stays importable where node:dns
 * doesn't exist (edge runtime, browser test envs) as long as nothing calls it.
 */
const defaultLookup: HostLookup = async (hostname) => {
  const { lookup } = await import("node:dns/promises");
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

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
  // Explicit wins; otherwise DNS guards the real network and stands down for a
  // fixture-backed client, which never leaves the process.
  const lookupImpl: HostLookup | null =
    options.lookupImpl !== undefined
      ? options.lookupImpl
      : options.fetchImpl
        ? null
        : defaultLookup;

  let requests = 0;
  let notModified = 0;
  let failures = 0;
  let lastRequestAt = 0;

  // ---- concurrency + budget, enforced together ------------------------------
  //
  // maxConcurrency was declared and never read, and `requests` incremented only
  // AFTER the crawl-delay await. Concurrent get() calls could therefore all pass
  // the budget check, all observe the same lastRequestAt, and blow straight
  // through both the declared budget and the politeness floor a source's robots
  // review actually asked for. A limit nothing reads is not a limit.
  //
  // The slot is transferred, never released-then-reacquired: handing it directly
  // to the next waiter closes the microtask gap where a fresh caller could
  // otherwise slip in and push inFlight past the cap.
  const maxInFlight = Math.max(1, descriptor.maxConcurrency);
  let inFlight = 0;
  const waiting: Array<() => void> = [];

  async function acquireSlot(): Promise<void> {
    if (inFlight < maxInFlight) {
      inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve)); // inherits a slot
  }

  function releaseSlot(): void {
    const next = waiting.shift();
    if (next) return next(); // hand the slot over; inFlight stays put
    inFlight -= 1;
  }

  /**
   * Take a budget slot. Synchronous by design: the check and the take cannot be
   * split by an await, so two callers can never both see the last slot free.
   */
  function reserveBudget(): boolean {
    if (requests >= descriptor.requestBudgetPerRun) return false;
    requests += 1;
    return true;
  }

  function budgetExhausted(url: string): SourceFetchResult {
    return {
      status: "failed",
      url,
      failure: "budget_exhausted",
      httpStatus: null,
      attempts: 0,
      message: `source "${descriptor.id}" exhausted its ${descriptor.requestBudgetPerRun}-request budget`,
    };
  }

  function policyFailure(
    url: string,
    failure: FetchFailureClass,
    message: string,
  ): SourceFetchResult {
    failures += 1;
    return { status: "failed", url, failure, httpStatus: null, attempts: 0, message };
  }

  async function respectCrawlDelay(): Promise<void> {
    if (lastRequestAt === 0) return;
    const elapsed = Date.now() - lastRequestAt;
    const wait = descriptor.crawlDelayMs - elapsed;
    if (wait > 0) await sleep(wait);
  }

  /**
   * The DNS half of the SSRF guard. `isPublicHostLiteral` already settled IP
   * literals synchronously; this catches the names — metadata.google.internal,
   * or any hostname an attacker points at 127.0.0.1. Fails closed: if ANY
   * resolved address is non-public, the destination is refused.
   */
  async function guardResolved(url: string): Promise<SourceFetchResult | null> {
    if (!lookupImpl) return null;
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return policyFailure(url, "blocked_by_policy", `${url} is not a parseable URL`);
    }
    const literal = hostname.replace(/^\[/, "").replace(/\]$/, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(literal) || literal.includes(":")) return null;

    let addresses: string[];
    try {
      addresses = await lookupImpl(hostname);
    } catch {
      // Unresolvable is a network fact, not a policy verdict — let it retry.
      return policyFailure(url, "network", `DNS lookup failed for ${hostname}`);
    }
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      return policyFailure(
        url,
        "blocked_by_policy",
        `${hostname} resolves to a non-public address (${addresses.join(", ") || "no records"}) — refusing to request it`,
      );
    }
    return null;
  }

  /**
   * Read the body incrementally and stop at the cap. `(await response.text())
   * .slice(...)` downloads and allocates the WHOLE body first, so a hostile or
   * broken source could exhaust worker memory long before the cap was applied —
   * the cap has to bound the read, not trim the result.
   */
  async function readCappedBody(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return (await response.text()).slice(0, MAX_BODY_CHARS);
    const decoder = new TextDecoder();
    let out = "";
    try {
      while (out.length < MAX_BODY_CHARS) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
      }
    } finally {
      // Hang up on the remainder rather than draining it politely.
      await reader.cancel().catch(() => undefined);
    }
    return out.slice(0, MAX_BODY_CHARS);
  }

  async function once(url: string, init: RequestInit, readBody: boolean): Promise<Hop> {
    // Hold a concurrency slot across the ENTIRE request, crawl delay included:
    // the delay is only politeness if it actually spaces requests out, which it
    // cannot do if parallel callers wait it out simultaneously.
    await acquireSlot();
    try {
      return await request(url, init, readBody);
    } finally {
      releaseSlot();
    }
  }

  async function request(url: string, init: RequestInit, readBody: boolean): Promise<Hop> {
    // Reserve before the await. Anything after this point has a slot; anything
    // that can't get one never reaches the network.
    if (!reserveBudget()) return { kind: "result", result: budgetExhausted(url) };

    await respectCrawlDelay();

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), descriptor.timeoutMs);
    // The caller's signal and our timeout both need to cancel this request;
    // AbortSignal.any composes them without leaking either.
    const signals = [timeout.signal, options.signal, (init as { signal?: AbortSignal }).signal]
      .filter((s): s is AbortSignal => Boolean(s));

    try {
      lastRequestAt = Date.now();
      const response = await fetchImpl(url, {
        ...init,
        // MANUAL, not "follow": fetch would chase a Location off-allowlist and
        // touch the destination before this client ever saw response.url, so
        // the per-source boundary would be advisory. Every hop is re-guarded by
        // followChain instead.
        redirect: "manual",
        headers: { "User-Agent": userAgent, ...(init.headers ?? {}) },
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      });

      // 304 is a 3xx but is NOT a redirect — it must be settled before the
      // redirect branch or a conditional GET turns into a bogus hop.
      if (response.status === 304) {
        notModified += 1;
        return {
          kind: "result",
          result: { status: "not_modified", url, finalUrl: url, httpStatus: 304 },
        };
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            kind: "result",
            result: {
              status: "failed",
              url,
              failure: "server_error",
              httpStatus: response.status,
              attempts: 1,
              message: `GET ${url} -> ${response.status} with no Location header`,
            },
          };
        }
        let target: string;
        try {
          target = new URL(location, url).toString(); // Location may be relative
        } catch {
          return {
            kind: "result",
            result: {
              status: "failed",
              url,
              failure: "server_error",
              httpStatus: response.status,
              attempts: 1,
              message: `GET ${url} -> ${response.status} with an unparseable Location (${location})`,
            },
          };
        }
        return { kind: "redirect", location: target, httpStatus: response.status };
      }

      const body = readBody ? await readCappedBody(response) : null;
      const failure = classifyStatus(response.status, body);
      if (failure) {
        failures += 1;
        return {
          kind: "result",
          result: {
            status: "failed",
            url,
            failure,
            httpStatus: response.status,
            attempts: 1,
            message: `GET ${url} -> ${response.status}`,
          },
        };
      }

      if (readBody && (!body || body.trim().length === 0)) {
        failures += 1;
        return {
          kind: "result",
          result: {
            status: "failed",
            url,
            failure: "empty_body",
            httpStatus: response.status,
            attempts: 1,
            message: `GET ${url} -> ${response.status} with an empty body`,
          },
        };
      }

      return {
        kind: "result",
        result: {
          status: "ok",
          url,
          finalUrl: url,
          body: body ?? "",
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          httpStatus: response.status,
        },
      };
    } catch (error) {
      failures += 1;
      return {
        kind: "result",
        result: {
          status: "failed",
          url,
          failure: classifyError(error),
          httpStatus: null,
          attempts: 1,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Walk a redirect chain, re-applying policy + SSRF to EVERY hop.
   *
   * The two modes differ only in what an off-reach hop means:
   *
   * - `fetch`  — a redirect that leaves the source's reach is a policy breach.
   *              Refuse it; never request the destination.
   * - `resolve`— a redirect that leaves the source's reach is the ANSWER. That
   *              is precisely what Sweepstakes Advantage's /go.php exists to do:
   *              hand back the sponsor's URL. Return the Location **unfetched**
   *              and let the caller re-gate it under official_direct. Fetching
   *              it here would use the discovery source's approval to reach a
   *              host that source was never approved for.
   */
  async function followChain(
    startUrl: string,
    init: RequestInit,
    readBody: boolean,
    mode: "fetch" | "resolve",
  ): Promise<SourceFetchResult> {
    let url = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const blocked = guard(url) ?? (await guardResolved(url));
      if (blocked) return blocked;

      const outcome = await once(url, init, readBody);
      if (outcome.kind === "result") return outcome.result;

      const target = outcome.location;
      const withinReach = isUrlAllowed(descriptor, target);

      if (!withinReach) {
        if (mode === "resolve") {
          // The destination of the chain — reported, not requested.
          if (!isPublicHostLiteral(new URL(target).hostname)) {
            return policyFailure(
              target,
              "blocked_by_policy",
              `${startUrl} redirects to a non-public destination (${target}) — refusing to report it as an official URL`,
            );
          }
          return {
            status: "ok",
            url: startUrl,
            finalUrl: target,
            body: "",
            etag: null,
            lastModified: null,
            httpStatus: outcome.httpStatus,
          };
        }
        return policyFailure(
          target,
          "blocked_by_policy",
          `${url} redirected to ${target}, outside the declared reach of source "${descriptor.id}"`,
        );
      }

      url = target; // in-reach hop: re-guarded at the top of the next iteration
    }

    return policyFailure(
      url,
      "too_many_redirects",
      `${startUrl} exceeded ${MAX_REDIRECTS} redirects`,
    );
  }

  async function withRetries(
    url: string,
    init: RequestInit,
    readBody: boolean,
    mode: "fetch" | "resolve",
  ): Promise<SourceFetchResult> {
    let attempt = 0;
    let last: SourceFetchResult = await followChain(url, init, readBody, mode);
    while (
      last.status === "failed" &&
      isRetryable(last.failure) &&
      attempt < descriptor.maxRetries
    ) {
      // Budget BEFORE the counter. Incrementing first meant that when the
      // initial request consumed the last slot, the reported `attempts` claimed
      // two requests where only one was made — audit telemetry has to match the
      // network activity it is auditing, or it is worse than none.
      if (requests >= descriptor.requestBudgetPerRun) break;
      attempt += 1;
      // Exponential backoff on top of the crawl delay: a struggling source gets
      // less traffic from us, not the same traffic repeated.
      await sleep(descriptor.crawlDelayMs * 2 ** attempt);
      last = await followChain(url, init, readBody, mode);
    }
    if (last.status === "failed") return { ...last, attempts: attempt + 1 };
    return last;
  }

  function guard(url: string): SourceFetchResult | null {
    if (!isUrlAllowed(descriptor, url)) {
      return policyFailure(
        url,
        "blocked_by_policy",
        `${url} is outside the declared reach of source "${descriptor.id}"`,
      );
    }
    // Fast path only — the authoritative check is reserveBudget(), which takes
    // the slot atomically. This just avoids a pointless DNS lookup and slot
    // wait when the budget is already visibly gone. Not a policy breach, so it
    // is not counted as a failure.
    if (requests >= descriptor.requestBudgetPerRun) return budgetExhausted(url);
    return null;
  }

  return {
    async get(url, getOptions) {
      const headers: Record<string, string> = {};
      // Only send validators to sources that actually honor them; a source that
      // ignores If-None-Match would return 200 forever and the header is noise.
      let conditional = getOptions?.conditional;
      if (descriptor.supportsConditionalRequests && !conditional && options.fetchState) {
        // A stored validator is best-effort: never fail a fetch because we
        // could not remember what we saw last time.
        conditional = (await options.fetchState.load(url).catch(() => null)) ?? undefined;
      }
      if (descriptor.supportsConditionalRequests && conditional) {
        if (conditional.etag) headers["If-None-Match"] = conditional.etag;
        if (conditional.lastModified) headers["If-Modified-Since"] = conditional.lastModified;
      }

      const result = await withRetries(url, { headers }, true, "fetch");

      if (descriptor.supportsConditionalRequests && options.fetchState) {
        if (result.status === "ok") {
          await options.fetchState
            .save(url, {
              etag: result.etag,
              lastModified: result.lastModified,
              httpStatus: result.httpStatus,
              notModified: false,
            })
            .catch(() => undefined);
        } else if (result.status === "not_modified") {
          // Refresh last_fetched_at and keep the validators we already hold.
          await options.fetchState
            .save(url, {
              etag: conditional?.etag ?? null,
              lastModified: conditional?.lastModified ?? null,
              httpStatus: 304,
              notModified: true,
            })
            .catch(() => undefined);
        }
      }
      return result;
    },

    async resolve(url) {
      return withRetries(url, {}, false, "resolve");
    },

    stats() {
      return { requests, budget: descriptor.requestBudgetPerRun, notModified, failures };
    },
  };
}
