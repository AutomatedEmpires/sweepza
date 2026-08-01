import "server-only";

import type { SourceComplianceState } from "@/lib/ingestion/compliance";
import {
  evaluateOfficialDestinationPolicy,
  type OfficialDestinationPolicy,
} from "@/lib/ingestion/official-destination-policy";
import type {
  RobotsPosture,
  TosPosture,
} from "@/lib/ingestion/source";
import type { OfficialDestinationPolicyEventInput } from "@/lib/official-destination-policy-event-schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface OfficialDestinationPolicyRow {
  id: number;
  hostname: string;
  path_prefix: string;
  include_subdomains: boolean;
  compliance_state: SourceComplianceState;
  robots_posture: RobotsPosture;
  tos_posture: TosPosture;
  terms_url: string | null;
  robots_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  review_expires_at: string | null;
}

const COLUMNS =
  "id, hostname, path_prefix, include_subdomains, compliance_state, robots_posture, tos_posture, terms_url, robots_url, approved_by, approved_at, review_expires_at";

/**
 * Read the current decision for every reviewed destination scope.
 *
 * This deliberately throws on an unavailable table/read. The orchestrator
 * treats policy authority being unreadable as a fatal, fail-closed condition;
 * it must never reinterpret an infrastructure error as permission.
 */
export async function listCurrentOfficialDestinationPolicies(): Promise<
  OfficialDestinationPolicy[]
> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("official_destination_policy_current")
    .select(COLUMNS)
    .order("hostname")
    .order("path_prefix");

  if (error) {
    throw new Error(
      `listCurrentOfficialDestinationPolicies failed: ${error.message}`,
    );
  }

  return ((data ?? []) as OfficialDestinationPolicyRow[]).map((row) => ({
    id: row.id,
    hostname: row.hostname,
    pathPrefix: row.path_prefix,
    includeSubdomains: row.include_subdomains,
    complianceState: row.compliance_state,
    robotsPosture: row.robots_posture,
    tosPosture: row.tos_posture,
    termsUrl: row.terms_url,
    robotsUrl: row.robots_url,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    reviewExpiresAt: row.review_expires_at,
  }));
}

export interface OfficialDestinationPolicyReadiness {
  configuredDestinationCount: number;
  approvedDestinationCount: number;
  ready: boolean;
}

export interface OfficialDestinationPolicyAppendResult {
  id: number;
  idempotent: boolean;
}

export class OfficialDestinationPolicyWriteError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = "OfficialDestinationPolicyWriteError";
  }
}

/**
 * Append one attributed operator decision. Callers must enforce admin/owner
 * authorization before invoking this service-role RPC. The database rechecks
 * the role, serializes the exact scope, and makes transport retries idempotent.
 */
export async function appendOfficialDestinationPolicyEvent(input: {
  actorUserId: string;
  decision: OfficialDestinationPolicyEventInput;
}): Promise<OfficialDestinationPolicyAppendResult> {
  const { actorUserId, decision } = input;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .rpc("append_official_destination_policy_event", {
      p_actor_user_id: actorUserId,
      p_decision: decision,
      p_expected_current_id: decision.expectedCurrentId,
      p_idempotency_key: decision.idempotencyKey,
    })
    .single<OfficialDestinationPolicyAppendResult>();

  if (error) {
    throw new OfficialDestinationPolicyWriteError(
      `appendOfficialDestinationPolicyEvent failed: ${error.message}`,
      error.code,
    );
  }

  return data;
}

/**
 * Small health hook for callers that must not equate a globally approved
 * official_direct source with usable destination authority.
 *
 * Keep source-health presentation outside this module; it can consume this
 * helper and report ready only when `ready` is true.
 */
export async function getOfficialDestinationPolicyReadiness(
  now = new Date(),
): Promise<OfficialDestinationPolicyReadiness> {
  const policies = await listCurrentOfficialDestinationPolicies();
  const approvedDestinationCount = policies.filter((policy) =>
    evaluateOfficialDestinationPolicy({
      url: `https://${policy.hostname}${policy.pathPrefix}`,
      // Readiness must use the same complete authority snapshot as transport.
      // Evaluating a candidate in isolation would miss a newer broad
      // pause/block/revoke that contains an older narrow approval.
      policies,
      now,
    }).allowed,
  ).length;

  return {
    configuredDestinationCount: policies.length,
    approvedDestinationCount,
    ready: approvedDestinationCount > 0,
  };
}
