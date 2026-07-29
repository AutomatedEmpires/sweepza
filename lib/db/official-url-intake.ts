import "server-only";

import { createHash } from "node:crypto";
import {
  enqueueOfficialUrlIntakeWork,
  OfficialUrlIntakeIdempotencyConflictError,
} from "@/lib/db/discovery-work";
import {
  OFFICIAL_URL_INTAKE_PAYLOAD_KIND,
  type OfficialUrlIntakeEntry,
  type OfficialUrlIntakeQueuePayload,
} from "@/lib/official-url-intake-schema";

/**
 * The queue key is stable for one operator-owned external identity without
 * exposing that caller-supplied identity in a primary key or log surface.
 * Replaying the same key + URL is a no-op; a different payload under the same
 * key is a conflict and can never overwrite or reopen the original work.
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

export async function enqueueOfficialUrlIntake(input: {
  actorAppUserId: string;
  entries: OfficialUrlIntakeEntry[];
}): Promise<{ accepted: number; replayed: number }> {
  const workItems = input.entries.map((entry) => {
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
  const accepted = await enqueueOfficialUrlIntakeWork(workItems);

  return {
    accepted,
    replayed: input.entries.length - accepted,
  };
}

export { OfficialUrlIntakeIdempotencyConflictError };
