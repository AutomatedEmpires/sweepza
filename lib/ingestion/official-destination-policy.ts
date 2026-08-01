import type {
  RobotsPosture,
  TosPosture,
} from "@/lib/ingestion/source";
import type { SourceComplianceState } from "@/lib/ingestion/compliance";
import { isRegistrablePublicHostname } from "@/lib/public-hostname";

/**
 * One current decision from the append-only official-destination policy
 * ledger. The database view returns only the latest decision for each exact
 * host/path scope; this pure shape keeps the gate testable and usable by the
 * HTTP transport without importing server-only database code.
 */
export interface OfficialDestinationPolicy {
  id: number;
  hostname: string;
  pathPrefix: string;
  includeSubdomains: boolean;
  complianceState: SourceComplianceState;
  robotsPosture: RobotsPosture;
  tosPosture: TosPosture;
  termsUrl: string | null;
  robotsUrl: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewExpiresAt: string | null;
}

export type OfficialDestinationDenialReason =
  | "invalid_url"
  | "https_required"
  | "non_default_port"
  | "policy_missing"
  | "policy_not_production_approved"
  | "tos_not_permitted"
  | "robots_not_permitted"
  | "approval_evidence_missing"
  | "approval_metadata_missing"
  | "approval_expired";

export type OfficialDestinationDecision =
  | { allowed: true; policy: OfficialDestinationPolicy }
  | {
      allowed: false;
      reason: OfficialDestinationDenialReason;
      detail: string;
      policy?: OfficialDestinationPolicy;
    };

function normalizedHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function hostMatches(policy: OfficialDestinationPolicy, hostname: string): boolean {
  const policyHost = normalizedHostname(policy.hostname);
  if (!isRegistrablePublicHostname(policyHost)) return false;
  if (hostname === policyHost) return true;
  return policy.includeSubdomains && hostname.endsWith(`.${policyHost}`);
}

/**
 * A prefix is a path scope, not a string prefix. `/rules` therefore matches
 * `/rules` and `/rules/2026`, but never `/rules-archive`.
 */
function pathMatches(pathname: string, prefix: string): boolean {
  if (prefix === "/") return true;
  const normalized = prefix.length > 1 ? prefix.replace(/\/+$/, "") : prefix;
  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}

function specificity(
  policy: OfficialDestinationPolicy,
  hostname: string,
): number {
  // Order authority from narrowest to broadest: exact target host, exact-only
  // scope, longest reviewed parent, then longest path. Without the exact-only
  // term, a newer wildcard approval for the same hostname could outrank an
  // explicit apex pause.
  const exactHost = normalizedHostname(policy.hostname) === hostname;
  return (
    (exactHost ? 1_000_000_000 : 0) +
    (!policy.includeSubdomains ? 100_000_000 : 0) +
    normalizedHostname(policy.hostname).length * 10_000 +
    policy.pathPrefix.length
  );
}

const CONTAINMENT_STATES = new Set<SourceComplianceState>([
  "paused",
  "blocked",
  "revoked",
]);

function isHttpsEvidenceUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolve and evaluate the most-specific policy for one destination.
 *
 * Default deny is deliberate: no row, an unreadable URL, stale approval
 * metadata, an expired review, or any non-production state all refuse network
 * access. A more-specific paused/revoked row overrides a broader approved row.
 */
export function evaluateOfficialDestinationPolicy(input: {
  url: string;
  policies: readonly OfficialDestinationPolicy[];
  now?: Date;
}): OfficialDestinationDecision {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return {
      allowed: false,
      reason: "invalid_url",
      detail: "The official destination is not a parseable URL.",
    };
  }

  if (url.protocol !== "https:") {
    return {
      allowed: false,
      reason: "https_required",
      detail: `Official destination "${url.hostname}" is not HTTPS.`,
    };
  }
  if (url.port && url.port !== "443") {
    return {
      allowed: false,
      reason: "non_default_port",
      detail: `Official destination "${url.hostname}" uses unreviewed HTTPS port ${url.port}.`,
    };
  }

  const hostname = normalizedHostname(url.hostname);
  const matches = input.policies
    .filter(
      (policy) =>
        hostMatches(policy, hostname) &&
        pathMatches(url.pathname, policy.pathPrefix),
    )
    .sort(
      (left, right) =>
        specificity(right, hostname) - specificity(left, hostname) ||
        right.id - left.id,
    );
  let policy = matches[0];

  if (!policy) {
    return {
      allowed: false,
      reason: "policy_missing",
      detail: `No reviewed official-destination policy covers "${hostname}${url.pathname}".`,
    };
  }

  // A newer broad containment decision is an emergency stop for every older
  // matching approval beneath it. A later narrow approval can deliberately
  // reopen one scope because its event id will be newer than the stop.
  const containmentOverride = matches
    .filter(
      (candidate) =>
        CONTAINMENT_STATES.has(candidate.complianceState) &&
        candidate.id > policy.id,
    )
    .sort((left, right) => right.id - left.id)[0];
  if (containmentOverride) policy = containmentOverride;

  if (policy.complianceState !== "approved_for_production") {
    return {
      allowed: false,
      reason: "policy_not_production_approved",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" is ${policy.complianceState}, not approved_for_production.`,
      policy,
    };
  }
  if (policy.tosPosture !== "permits_use") {
    return {
      allowed: false,
      reason: "tos_not_permitted",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" has ToS posture ${policy.tosPosture}, not permits_use.`,
      policy,
    };
  }
  if (
    policy.robotsPosture !== "permissive" &&
    policy.robotsPosture !== "permissive_with_delay"
  ) {
    return {
      allowed: false,
      reason: "robots_not_permitted",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" has robots posture ${policy.robotsPosture}.`,
      policy,
    };
  }
  if (
    !isHttpsEvidenceUrl(policy.termsUrl) ||
    !isHttpsEvidenceUrl(policy.robotsUrl)
  ) {
    return {
      allowed: false,
      reason: "approval_evidence_missing",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" lacks HTTPS terms or robots evidence.`,
      policy,
    };
  }
  if (!policy.approvedBy?.trim() || !policy.approvedAt) {
    return {
      allowed: false,
      reason: "approval_metadata_missing",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" lacks approval attribution.`,
      policy,
    };
  }

  const approvedAt = Date.parse(policy.approvedAt);
  if (Number.isNaN(approvedAt)) {
    return {
      allowed: false,
      reason: "approval_metadata_missing",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" has an unreadable approval timestamp.`,
      policy,
    };
  }

  if (!policy.reviewExpiresAt) {
    return {
      allowed: false,
      reason: "approval_expired",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" lacks a bounded compliance review window.`,
      policy,
    };
  }
  const expiresAt = Date.parse(policy.reviewExpiresAt);
  if (
    Number.isNaN(expiresAt) ||
    expiresAt <= (input.now ?? new Date()).getTime()
  ) {
    return {
      allowed: false,
      reason: "approval_expired",
      detail: `Official destination "${policy.hostname}${policy.pathPrefix}" has an expired or unreadable compliance review.`,
      policy,
    };
  }

  return { allowed: true, policy };
}

/** Transport predicate applied to the initial URL and every redirect/asset hop. */
export function createOfficialDestinationUrlPolicy(
  policies:
    | readonly OfficialDestinationPolicy[]
    | (() => readonly OfficialDestinationPolicy[]),
  now?: Date,
): (url: string) => boolean {
  return (url) => {
    const currentPolicies =
      typeof policies === "function" ? policies() : policies;
    return evaluateOfficialDestinationPolicy({
      url,
      policies: currentPolicies,
      now,
    }).allowed;
  };
}
