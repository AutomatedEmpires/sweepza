import { isFixtureExecutable, type SourceComplianceState } from "@/lib/ingestion/compliance";
import type { FetchFailureClass, SourceHttpClient } from "@/lib/ingestion/http";

// Source-adapter seam. The orchestrator is source-agnostic: a discovery source
// yields candidate official URLs (links only), and the pipeline fetches +
// verifies each at the source of truth.
//
// Operational policy lives HERE, as data, not inside adapter code. An adapter
// decides how to parse a page; the descriptor decides whether that page may be
// requested at all, how often, from which hosts, and under whose approval. That
// split is what makes source onboarding reviewable: a new source is a policy
// decision plus a parser, and the policy half is readable without reading code.

/** A candidate surfaced by a Tier-1 discovery source — a lead, not a listing. */
export interface DiscoveredLead {
  /** Candidate official/entry URL to fetch & verify at the source. */
  officialUrl: string;
  /** The discovery page it came from (provenance). */
  sourceUrl?: string;
  /**
   * Untrusted hints from the discovery page (title, end date). Used only to
   * prioritize/skip — never published. Every fact comes from the official page.
   */
  hint?: { title?: string; endDate?: string };
}

/**
 * Everything an adapter is allowed to touch. Adapters receive their HTTP client
 * rather than importing one: the client is pre-bound to the source's policy
 * (host allowlist, crawl delay, request budget, timeouts, conditional GET), and
 * a fixture-backed client is substituted in tests and dry runs. An adapter that
 * called global `fetch` would bypass every one of those controls, so the
 * contract never hands it the option.
 */
export interface AdapterContext {
  http: SourceHttpClient;
  /** Max leads to return this pass. */
  limit: number;
  signal?: AbortSignal;
}

/**
 * A SOURCE-LEVEL fetch failed — the hub or index page the adapter needs before
 * it can discover anything. Thrown, not returned, because it must not be
 * confusable with "no new sweeps".
 *
 * That distinction is the whole point. An adapter that turned a 500 on the hub
 * into `[]` made a down source indistinguishable from a quiet day: the
 * orchestrator recorded `ok`, `recordRunOutcome` reset `consecutive_failures`,
 * and the circuit breaker could never open for the outages it exists to
 * contain. A PER-LEAD failure is different and still just drops that lead — one
 * sponsor's page being down is not the source being down.
 */
export class SourceFetchError extends Error {
  readonly failure: FetchFailureClass;
  readonly url: string;

  constructor(url: string, failure: FetchFailureClass, detail?: string) {
    super(`source fetch failed (${failure}) for ${url}${detail ? `: ${detail}` : ""}`);
    this.name = "SourceFetchError";
    this.failure = failure;
    this.url = url;
  }
}

export interface SourceAdapter {
  readonly id: string;
  discover(context: AdapterContext): Promise<DiscoveredLead[]>;
}

export type SourceTier = "official" | "discovery";

/** How the source's robots.txt treats us. Recorded, not inferred at runtime. */
export type RobotsPosture = "permissive" | "permissive_with_delay" | "restricted" | "unknown";

/**
 * Terms-of-service review outcome. `unreviewed` is the honest default and is
 * NOT a green light — the compliance ladder gates execution, and no source can
 * reach production approval while its ToS posture is unreviewed.
 */
export type TosPosture = "unreviewed" | "permits_use" | "prohibits_use" | "requires_agreement";

/** Static descriptor for a configured source — the policy decision, as data. */
export interface SourceDescriptor {
  id: string;
  label: string;
  tier: SourceTier;
  homepage: string;

  // ---- Reach: where this source may be fetched from at all -----------------
  /** Hostnames the adapter may request (www./scheme-insensitive). Empty = none. */
  allowedHosts: string[];
  /** Path prefixes permitted on those hosts. Empty = any path on an allowed host. */
  allowedPathPrefixes: string[];

  // ---- Rate & budget ------------------------------------------------------
  /** Politeness floor between requests (Freebie Guy asks for 10s in robots). */
  crawlDelayMs: number;
  /** Hard ceiling on requests per discovery pass — a runaway-loop backstop. */
  requestBudgetPerRun: number;
  /** Concurrent requests permitted. 1 = strictly sequential (the default). */
  maxConcurrency: number;
  /** Per-request timeout. */
  timeoutMs: number;

  // ---- Freshness & conditional requests -----------------------------------
  /** How often a pass is expected to be worth running. */
  refreshIntervalMinutes: number;
  /** Whether the source honors If-None-Match / If-Modified-Since. */
  supportsConditionalRequests: boolean;

  // ---- Failure handling ---------------------------------------------------
  /** Retryable failures attempted per request before giving up. */
  maxRetries: number;
  /** Consecutive failed runs that trip the circuit breaker for this source. */
  failureThreshold: number;

  // ---- Compliance & approval ----------------------------------------------
  /**
   * The registry's static floor for this source. The DB record (source_registry)
   * may sit at or below this value but never above it: shipping code cannot
   * grant an approval, and a founder's approval cannot exceed what review
   * encoded here. Both must say production before anything runs live.
   */
  complianceState: SourceComplianceState;
  robotsPosture: RobotsPosture;
  tosPosture: TosPosture;
  /** Attribution owed when displaying anything derived from this source. */
  attribution: string | null;
  /** Max days raw captured artifacts from this source may be retained. */
  dataRetentionDays: number;
  /**
   * Code-level kill switch, independent of compliance state. Flipping this true
   * stops the source without unwinding its approval history — the fastest safe
   * revert when a source misbehaves at 3am.
   */
  killSwitch: boolean;

  /**
   * Lower = build the adapter sooner. Ranked by discovery yield (new-listing
   * cadence + structure + crawl permission), not audience size — a big-traffic
   * site is worthless as a source if it blocks bots.
   */
  buildPriority: number;
  notes: string;
}

// The approved source policy, encoded. Every source sits at or below
// `approved_for_fixtures`: adapters are exercised against recorded fixtures in
// CI, and NOTHING is approved for production. Moving a source to
// `approved_for_production` is a founder decision recorded in the database with
// an actor and a timestamp — never a code edit alone.
export const SOURCE_REGISTRY: SourceDescriptor[] = [
  {
    id: "official_direct",
    label: "Sponsor official pages",
    tier: "official",
    homepage: "",
    allowedHosts: [],
    allowedPathPrefixes: [],
    crawlDelayMs: 1000,
    requestBudgetPerRun: 50,
    maxConcurrency: 1,
    timeoutMs: 15000,
    refreshIntervalMinutes: 1440,
    supportsConditionalRequests: true,
    maxRetries: 2,
    failureThreshold: 5,
    complianceState: "reviewed",
    robotsPosture: "unknown",
    tosPosture: "unreviewed",
    attribution: null,
    dataRetentionDays: 365,
    killSwitch: false,
    buildPriority: 0,
    notes:
      "Tier A source of truth — sponsor rules/entry pages, PR wires, public entry-form platforms. Has no fixed host allowlist by design: the pipeline fetches whichever official page a lead resolves to, so its reach is bounded per-listing by the lead itself rather than by a static host list.",
  },
  {
    id: "sweeps_advantage",
    label: "Sweepstakes Advantage",
    tier: "discovery",
    homepage: "https://www.sweepsadvantage.com/",
    allowedHosts: ["sweepsadvantage.com"],
    allowedPathPrefixes: ["/new-sweepstakes", "/sweepstakes-", "/go.php"],
    crawlDelayMs: 2000,
    requestBudgetPerRun: 60,
    maxConcurrency: 1,
    timeoutMs: 15000,
    refreshIntervalMinutes: 720,
    supportsConditionalRequests: true,
    maxRetries: 2,
    failureThreshold: 3,
    complianceState: "approved_for_fixtures",
    robotsPosture: "permissive",
    tosPosture: "unreviewed",
    attribution: "Discovered via Sweepstakes Advantage",
    dataRetentionDays: 90,
    killSwitch: false,
    buildPriority: 1,
    notes:
      "Best discovery yield: 200+ new/day, structured prize/expiry/rules-link, robots permissive (blocks only wp-admin/ad dirs), since 1997. ToS review outstanding — blocks production approval.",
  },
  {
    id: "freebie_guy",
    label: "The Freebie Guy",
    tier: "discovery",
    homepage: "https://thefreebieguy.com/",
    allowedHosts: ["thefreebieguy.com"],
    allowedPathPrefixes: ["/category/sweepstakes", "/sweepstakes"],
    crawlDelayMs: 10000,
    requestBudgetPerRun: 25,
    maxConcurrency: 1,
    timeoutMs: 15000,
    refreshIntervalMinutes: 1440,
    supportsConditionalRequests: true,
    maxRetries: 1,
    failureThreshold: 3,
    complianceState: "approved_for_fixtures",
    robotsPosture: "permissive_with_delay",
    tosPosture: "unreviewed",
    attribution: "Discovered via The Freebie Guy",
    dataRetentionDays: 90,
    killSwitch: false,
    buildPriority: 2,
    notes:
      "Highest traffic (~1.8M/mo), robots permissive with Crawl-delay: 10 (respected via crawlDelayMs). Broad freebies/deals, so sweepstakes are a subset — the adapter must filter, and its low request budget reflects the 10s delay.",
  },
  {
    id: "sweepstakes_today",
    label: "Sweepstakes Today",
    tier: "discovery",
    homepage: "https://www.sweepstakestoday.com/",
    allowedHosts: ["sweepstakestoday.com"],
    allowedPathPrefixes: ["/listings", "/sweepstakes"],
    crawlDelayMs: 2000,
    requestBudgetPerRun: 60,
    maxConcurrency: 1,
    timeoutMs: 15000,
    refreshIntervalMinutes: 720,
    supportsConditionalRequests: false,
    maxRetries: 2,
    failureThreshold: 3,
    complianceState: "approved_for_fixtures",
    robotsPosture: "permissive",
    tosPosture: "unreviewed",
    attribution: "Discovered via Sweepstakes Today",
    dataRetentionDays: 90,
    killSwitch: false,
    buildPriority: 3,
    notes:
      "Curated, ~200K/mo, robots fully permissive (no disallow). Serves no validators, so conditional requests are unavailable — every pass is a full fetch, which its request budget accounts for.",
  },
];

/** Descriptors in build-priority order (soonest first). */
export function sourcesByBuildPriority(): SourceDescriptor[] {
  return [...SOURCE_REGISTRY].sort((a, b) => a.buildPriority - b.buildPriority);
}

export function getSourceDescriptor(id: string): SourceDescriptor | undefined {
  return SOURCE_REGISTRY.find((source) => source.id === id);
}

/**
 * The registry's own answer to "may this source run live?" — the static half of
 * the gate. The authoritative answer additionally requires the database
 * approval record and the INGESTION_ENABLED switch; see
 * `lib/ingestion/gate.ts`, which is what execution paths must call.
 */
export function productionApprovedSources(): SourceDescriptor[] {
  return SOURCE_REGISTRY.filter(
    (source) => source.complianceState === "approved_for_production" && !source.killSwitch,
  );
}

/**
 * Sources whose adapters may run against recorded fixtures (CI, dry runs).
 *
 * The kill switch alone is not the bar. Filtering on it only returned every
 * source that wasn't switched off — including `draft`, `research_required`,
 * `reviewed`, `paused`, `blocked`, and even `revoked` — which contradicted
 * `isFixtureExecutable`, the module that actually defines the three rungs
 * permitting simulation. It also swept in `official_direct`, which sits at
 * `reviewed`. Both conditions are required, and the state test is the one that
 * carries the policy.
 */
export function fixtureApprovedSources(): SourceDescriptor[] {
  return SOURCE_REGISTRY.filter(
    (source) => isFixtureExecutable(source.complianceState) && !source.killSwitch,
  );
}
