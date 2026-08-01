import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  DiscoveryWorkItem,
  DiscoveryWorkQueue,
} from "@/lib/ingestion/source";

const OFFICIAL_INTAKE_CONFLICT =
  "official_url_intake_idempotency_conflict";
const MAX_DIAGNOSTIC_CHARS = 1000;

function boundedDiagnostic(reason: string, fallback: string): string {
  return (reason.trim() || fallback).slice(0, MAX_DIAGNOSTIC_CHARS);
}

export class OfficialUrlIntakeIdempotencyConflictError extends Error {
  constructor() {
    super(
      "An official URL intake idempotency key was already used for different work.",
    );
    this.name = "OfficialUrlIntakeIdempotencyConflictError";
  }
}

/**
 * Official URL intake keys are immutable. Unlike generic source snapshots,
 * a changed payload under the same actor-scoped key is a conflict, never a
 * correction or reopen.
 */
export async function enqueueOfficialUrlIntakeWork(
  items: DiscoveryWorkItem[],
): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "enqueue_official_url_intake_work",
    {
      p_items: items,
    },
  );
  if (error) {
    if (error.message.includes(OFFICIAL_INTAKE_CONFLICT)) {
      throw new OfficialUrlIntakeIdempotencyConflictError();
    }
    throw new Error(
      `enqueueOfficialUrlIntakeWork failed: ${error.message}`,
    );
  }
  if (!Number.isSafeInteger(data) || data < 0 || data > items.length) {
    throw new Error(
      "enqueueOfficialUrlIntakeWork failed: invalid inserted count",
    );
  }
  return data as number;
}

/** Database-backed adapter backlog, scoped to one discovery source. */
export function discoveryWorkQueue(sourceId: string): DiscoveryWorkQueue {
  return {
    async enqueue(items: DiscoveryWorkItem[]) {
      if (items.length === 0) return;
      if (sourceId === "official_direct") {
        throw new Error(
          "discoveryWorkQueue.enqueue refused: official_direct requires strict official URL intake",
        );
      }
      const supabase = createServiceRoleClient();
      const { error } = await supabase.rpc("enqueue_source_discovery_work", {
        p_source_id: sourceId,
        p_items: items,
      });
      if (error) throw new Error(`discoveryWorkQueue.enqueue failed: ${error.message}`);
    },

    async take(limit: number) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.rpc(
        "claim_source_discovery_work",
        {
          p_source_id: sourceId,
          p_limit: Math.min(500, Math.max(0, limit)),
          p_lease_seconds: 15 * 60,
        },
      );
      if (error) throw new Error(`discoveryWorkQueue.take failed: ${error.message}`);
      return (data ?? []).map((row: {
        item_key?: unknown;
        payload?: unknown;
        claim_token?: unknown;
      }) => {
        if (
          typeof row.item_key !== "string" ||
          typeof row.claim_token !== "string" ||
          !row.payload ||
          typeof row.payload !== "object" ||
          Array.isArray(row.payload)
        ) {
          throw new Error(
            "discoveryWorkQueue.take failed: malformed claim response",
          );
        }
        return {
          key: row.item_key,
          payload: row.payload as Record<string, unknown>,
          claimToken: row.claim_token,
        };
      });
    },

    async complete(key: string, claimToken: string) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.rpc(
        "complete_source_discovery_work",
        {
          p_source_id: sourceId,
          p_item_key: key,
          p_claim_token: claimToken,
        },
      );
      if (error) throw new Error(`discoveryWorkQueue.complete failed: ${error.message}`);
      if (data !== true) {
        throw new Error(
          `discoveryWorkQueue.complete failed: claim lost for "${key}"`,
        );
      }
    },

    async defer(key: string, claimToken: string, reason: string) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.rpc("defer_source_discovery_work", {
        p_source_id: sourceId,
        p_item_key: key,
        p_claim_token: claimToken,
        p_reason: boundedDiagnostic(reason, "retryable_work_deferred"),
      });
      if (error) throw new Error(`discoveryWorkQueue.defer failed: ${error.message}`);
      if (data !== true) {
        throw new Error(
          `discoveryWorkQueue.defer failed: claim lost for "${key}"`,
        );
      }
    },

    async deadLetter(key: string, claimToken: string, reason: string) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.rpc(
        "dead_letter_source_discovery_work",
        {
          p_source_id: sourceId,
          p_item_key: key,
          p_claim_token: claimToken,
          p_reason: boundedDiagnostic(reason, "terminal_work_quarantined"),
        },
      );
      if (error) {
        throw new Error(
          `discoveryWorkQueue.deadLetter failed: ${error.message}`,
        );
      }
      if (data !== true) {
        throw new Error(
          `discoveryWorkQueue.deadLetter failed: claim lost for "${key}"`,
        );
      }
    },
  };
}
