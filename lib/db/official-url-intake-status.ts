import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";

const OFFICIAL_QUEUE_SOURCE_ID = "official_direct";
const COUNT_COLUMNS = "item_key";

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

interface OldestPendingResult {
  data: Array<{ discovered_at: string }> | null;
  error: { message: string } | null;
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

function requireCount(label: string, result: CountResult): number {
  if (result.error) {
    throw new Error(
      `getOfficialUrlIntakeBacklogStatus ${label} failed: ${result.error.message}`,
    );
  }
  if (
    result.count === null ||
    !Number.isSafeInteger(result.count) ||
    result.count < 0
  ) {
    throw new Error(
      `getOfficialUrlIntakeBacklogStatus ${label} returned no exact count`,
    );
  }
  return result.count;
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

  const countQuery = () =>
    supabase
      .from("source_discovery_work_item")
      .select(COUNT_COLUMNS, { count: "exact", head: true })
      .eq("source_id", OFFICIAL_QUEUE_SOURCE_ID);

  const [pendingResult, retryingResult, completedResult, deadLetteredResult, oldestResult] =
    await Promise.all([
      countQuery().is("completed_at", null).eq("attempts", 0),
      countQuery().is("completed_at", null).gt("attempts", 0),
      countQuery()
        .not("completed_at", "is", null)
        .is("dead_lettered_at", null),
      countQuery().not("dead_lettered_at", "is", null),
      supabase
        .from("source_discovery_work_item")
        .select("discovered_at")
        .eq("source_id", OFFICIAL_QUEUE_SOURCE_ID)
        .is("completed_at", null)
        .order("discovered_at", { ascending: true })
        .limit(1),
    ]);

  const pending = requireCount("pending count", pendingResult);
  const retrying = requireCount("retrying count", retryingResult);
  const completed = requireCount("completed count", completedResult);
  const deadLettered = requireCount(
    "dead-letter count",
    deadLetteredResult,
  );

  const oldest = oldestResult as OldestPendingResult;
  if (oldest.error) {
    throw new Error(
      `getOfficialUrlIntakeBacklogStatus oldest pending failed: ${oldest.error.message}`,
    );
  }

  const openCount = pending + retrying;
  const oldestPendingAt = oldest.data?.[0]?.discovered_at ?? null;
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
