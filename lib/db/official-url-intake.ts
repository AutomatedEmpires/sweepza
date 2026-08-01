import "server-only";

import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  enqueueOfficialUrlIntakeWork,
  OfficialUrlIntakeIdempotencyConflictError,
} from "@/lib/db/discovery-work";
import {
  OFFICIAL_URL_INTAKE_PAYLOAD_KIND,
  type OfficialUrlIntakeEntry,
  type OfficialUrlIntakeQueuePayload,
} from "@/lib/official-url-intake-schema";

const OFFICIAL_INTAKE_CONFLICT =
  "official_url_intake_idempotency_conflict";
const OFFICIAL_REVALIDATION_NOT_FOUND =
  "official_url_intake_revalidation_not_found";

export class OfficialUrlIntakeRevalidationNotFoundError extends Error {
  constructor() {
    super(
      "Official URL revalidation requires a previously queued exact request.",
    );
    this.name = "OfficialUrlIntakeRevalidationNotFoundError";
  }
}

/**
 * The request key is stable for one operator-owned external identity without
 * exposing that caller-supplied identity in a primary key or log surface.
 * Replaying the same key + URL is a no-op; a different payload under the same
 * key is a conflict. Fresh validation uses a generation-specific queue key and
 * never overwrites or reopens this immutable root request.
 */
export function officialUrlIntakeItemKey(
  actorAppUserId: string,
  idempotencyKey: string,
): string {
  const digest = createHash("sha256")
    .update(`${actorAppUserId}\0${idempotencyKey}`)
    .digest("hex");
  return `admin-official:${digest}`;
}

function officialUrlIntakeWorkItems(input: {
  actorAppUserId: string;
  entries: OfficialUrlIntakeEntry[];
}) {
  return input.entries.map((entry) => {
    const payload: OfficialUrlIntakeQueuePayload = {
      kind: OFFICIAL_URL_INTAKE_PAYLOAD_KIND,
      officialUrl: entry.officialUrl,
      idempotencyKey: entry.idempotencyKey,
      authority: {
        type: "sweepza_operator",
        appUserId: input.actorAppUserId,
      },
    };
    return {
      key: officialUrlIntakeItemKey(
        input.actorAppUserId,
        entry.idempotencyKey,
      ),
      payload,
    };
  });
}

export async function enqueueOfficialUrlIntake(input: {
  actorAppUserId: string;
  entries: OfficialUrlIntakeEntry[];
}): Promise<{ accepted: number; replayed: number }> {
  const workItems = officialUrlIntakeWorkItems(input);
  const accepted = await enqueueOfficialUrlIntakeWork(workItems);

  return {
    accepted,
    replayed: input.entries.length - accepted,
  };
}

export async function revalidateOfficialUrlIntake(input: {
  actorAppUserId: string;
  entries: OfficialUrlIntakeEntry[];
}): Promise<{ revalidated: number; pending: number }> {
  if (input.entries.length === 0) {
    return { revalidated: 0, pending: 0 };
  }

  const workItems = officialUrlIntakeWorkItems(input);
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "revalidate_official_url_intake_work",
    {
      p_items: workItems,
      p_reason: "operator_revalidation",
    },
  );
  if (error) {
    if (error.message.includes(OFFICIAL_INTAKE_CONFLICT)) {
      throw new OfficialUrlIntakeIdempotencyConflictError();
    }
    if (error.message.includes(OFFICIAL_REVALIDATION_NOT_FOUND)) {
      throw new OfficialUrlIntakeRevalidationNotFoundError();
    }
    throw new Error(
      `revalidateOfficialUrlIntake failed: ${error.message}`,
    );
  }
  if (
    !Number.isSafeInteger(data) ||
    data < 0 ||
    data > input.entries.length
  ) {
    throw new Error(
      "revalidateOfficialUrlIntake failed: invalid queued count",
    );
  }

  return {
    revalidated: data as number,
    pending: input.entries.length - (data as number),
  };
}

/**
 * Enqueue a bounded rotation of successful requests whose latest generation is
 * old enough. This only creates durable work; the normal official-source gate,
 * destination authority, normalization, dedupe, and private-review path still
 * control execution.
 */
export async function enqueueDueOfficialUrlRevalidations(input: {
  limit: number;
  minAgeSeconds: number;
}): Promise<number> {
  if (
    !Number.isFinite(input.limit) ||
    !Number.isFinite(input.minAgeSeconds)
  ) {
    throw new Error(
      "enqueueDueOfficialUrlRevalidations requires finite bounds",
    );
  }
  const limit = Math.min(500, Math.max(0, Math.trunc(input.limit)));
  const minAgeSeconds = Math.min(
    31_536_000,
    Math.max(3_600, Math.trunc(input.minAgeSeconds)),
  );
  if (limit === 0) return 0;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "enqueue_due_official_url_revalidation_work",
    {
      p_limit: limit,
      p_min_age_seconds: minAgeSeconds,
    },
  );
  if (error) {
    throw new Error(
      `enqueueDueOfficialUrlRevalidations failed: ${error.message}`,
    );
  }
  if (!Number.isSafeInteger(data) || data < 0 || data > limit) {
    throw new Error(
      "enqueueDueOfficialUrlRevalidations failed: invalid queued count",
    );
  }
  return data as number;
}

export { OfficialUrlIntakeIdempotencyConflictError };
