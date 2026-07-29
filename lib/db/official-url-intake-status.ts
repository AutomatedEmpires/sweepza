import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";

interface BacklogSnapshotRow {
  pending?: unknown;
  retrying?: unknown;
  completed?: unknown;
  dead_lettered?: unknown;
  oldest_pending_at?: unknown;
}

export interface OfficialUrlIntakeBacklogStatus {
  pending: number;
  retrying: number;
  completed: number;
  deadLettered: number;
  oldestPendingAt: string | null;
  oldestPendingAgeMinutes: number | null;
  sampledAt: string;
}

function requireCount(label: string, value: unknown): number {
  const count =
    typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : value;
  if (!Number.isSafeInteger(count) || (count as number) < 0) {
    throw new Error(
      `getOfficialUrlIntakeBacklogStatus ${label} returned no exact count`,
    );
  }
  return count as number;
}

/**
 * Read an exact, bounded operator snapshot for first-party official URL intake.
 *
 * This service-role read must only be called after the admin sources page has
 * authenticated an app admin/owner. It returns aggregates plus one timestamp,
 * never queued URLs, payloads, operator identifiers, or dead-letter details.
 */
export async function getOfficialUrlIntakeBacklogStatus(
  now = new Date(),
): Promise<OfficialUrlIntakeBacklogStatus> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "get_official_url_intake_backlog_status",
  );
  if (error) {
    throw new Error(
      `getOfficialUrlIntakeBacklogStatus snapshot failed: ${error.message}`,
    );
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      "getOfficialUrlIntakeBacklogStatus snapshot returned no exact row",
    );
  }
  const row = data[0] as BacklogSnapshotRow;
  const pending = requireCount("pending count", row.pending);
  const retrying = requireCount("retrying count", row.retrying);
  const completed = requireCount("completed count", row.completed);
  const deadLettered = requireCount(
    "dead-letter count",
    row.dead_lettered,
  );

  const openCount = pending + retrying;
  const oldestPendingAt =
    typeof row.oldest_pending_at === "string"
      ? row.oldest_pending_at
      : null;
  if (openCount > 0 && !oldestPendingAt) {
    throw new Error(
      "getOfficialUrlIntakeBacklogStatus oldest pending row was unavailable",
    );
  }
  if (openCount === 0 && oldestPendingAt) {
    throw new Error(
      "getOfficialUrlIntakeBacklogStatus returned an inconsistent oldest pending row",
    );
  }

  let oldestPendingAgeMinutes: number | null = null;
  if (oldestPendingAt) {
    const oldestTimestamp = Date.parse(oldestPendingAt);
    if (Number.isNaN(oldestTimestamp)) {
      throw new Error(
        "getOfficialUrlIntakeBacklogStatus oldest pending timestamp was invalid",
      );
    }
    oldestPendingAgeMinutes = Math.max(
      0,
      Math.floor((now.getTime() - oldestTimestamp) / 60_000),
    );
  }

  return {
    pending,
    retrying,
    completed,
    deadLettered,
    oldestPendingAt,
    oldestPendingAgeMinutes,
    sampledAt: now.toISOString(),
  };
}
