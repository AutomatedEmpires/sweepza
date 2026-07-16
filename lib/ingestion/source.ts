// Source-adapter seam. The orchestrator is source-agnostic: a discovery source
// yields candidate official URLs (links only), and the pipeline fetches +
// verifies each at the source of truth. Adapters implement `discover`; live
// network code lands per-source once the source policy is locked (it is:
// official-first, permissive aggregators as discovery leads only).

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

export interface DiscoverOptions {
  /** Max leads to return this pass. */
  limit?: number;
  signal?: AbortSignal;
}

export interface SourceAdapter {
  readonly id: string;
  discover(options: DiscoverOptions): Promise<DiscoveredLead[]>;
}

export type SourceTier = "official" | "discovery";

/** Static descriptor for a configured source — the policy decision, as data. */
export interface SourceDescriptor {
  id: string;
  label: string;
  tier: SourceTier;
  homepage: string;
  /** Politeness floor between requests (Freebie Guy asks for 10s in robots). */
  crawlDelayMs: number;
  /**
   * Lower = build the adapter sooner. Ranked by discovery yield (new-listing
   * cadence + structure + crawl permission), not audience size — a big-traffic
   * site is worthless as a source if it blocks bots.
   */
  buildPriority: number;
  /** Flip on only once its adapter is implemented and its ToS is cleared. */
  enabled: boolean;
  notes: string;
}

// The approved source policy, encoded. `enabled: false` everywhere until each
// adapter is built and its Terms of Service are confirmed — robots permission
// is necessary but not sufficient.
export const SOURCE_REGISTRY: SourceDescriptor[] = [
  {
    id: "official_direct",
    label: "Sponsor official pages",
    tier: "official",
    homepage: "",
    crawlDelayMs: 1000,
    buildPriority: 0,
    enabled: false,
    notes: "Tier A source of truth — sponsor rules/entry pages, PR wires, public entry-form platforms.",
  },
  {
    id: "sweeps_advantage",
    label: "Sweepstakes Advantage",
    tier: "discovery",
    homepage: "https://www.sweepsadvantage.com/",
    crawlDelayMs: 2000,
    buildPriority: 1,
    enabled: false,
    notes: "Best discovery yield: 200+ new/day, structured prize/expiry/rules-link, robots permissive (blocks only wp-admin/ad dirs), since 1997.",
  },
  {
    id: "freebie_guy",
    label: "The Freebie Guy",
    tier: "discovery",
    homepage: "https://thefreebieguy.com/",
    crawlDelayMs: 10000,
    buildPriority: 2,
    enabled: false,
    notes: "Highest traffic (~1.8M/mo), robots permissive with Crawl-delay: 10 (respect it); broad freebies/deals so sweepstakes are a subset.",
  },
  {
    id: "sweepstakes_today",
    label: "Sweepstakes Today",
    tier: "discovery",
    homepage: "https://www.sweepstakestoday.com/",
    crawlDelayMs: 2000,
    buildPriority: 3,
    enabled: false,
    notes: "Curated, ~200K/mo, robots fully permissive (no disallow).",
  },
];

/** Descriptors in build-priority order (soonest first). */
export function sourcesByBuildPriority(): SourceDescriptor[] {
  return [...SOURCE_REGISTRY].sort((a, b) => a.buildPriority - b.buildPriority);
}

/** Only sources whose adapter is live and ToS-cleared. */
export function enabledSources(): SourceDescriptor[] {
  return SOURCE_REGISTRY.filter((source) => source.enabled);
}

export function getSourceDescriptor(id: string): SourceDescriptor | undefined {
  return SOURCE_REGISTRY.find((source) => source.id === id);
}
