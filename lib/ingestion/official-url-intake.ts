import type {
  DiscoveredLead,
  DiscoveryWorkQueue,
} from "@/lib/ingestion/source";
import { officialUrlIntakeQueuePayloadSchema } from "@/lib/official-url-intake-schema";

export interface AttributedOfficialLead {
  lead: DiscoveredLead;
  /** Internal provenance written with the private draft. */
  provenanceSource: string;
}

/**
 * Drain validated operator-approved official URLs from the existing durable
 * source queue. Corrupt/legacy payloads are dead-lettered with a bounded
 * schema diagnostic; retrying them cannot make them valid and would otherwise
 * poison every daily pass.
 */
export async function takeOfficialUrlIntakeLeads(
  queue: DiscoveryWorkQueue,
  limit: number,
): Promise<AttributedOfficialLead[]> {
  const items = await queue.take(Math.min(500, Math.max(0, limit)));
  const leads: AttributedOfficialLead[] = [];

  for (const item of items) {
    const parsed = officialUrlIntakeQueuePayloadSchema.safeParse(item.payload);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
          return `${path}: ${issue.message}`;
        })
        .join("; ");
      await queue.deadLetter(
        item.key,
        item.claimToken,
        `invalid_official_url_intake_payload: ${issues}`.slice(0, 1000),
      );
      continue;
    }

    if (
      parsed.data.refresh &&
      item.key !==
        `${parsed.data.refresh.requestItemKey}:refresh:${parsed.data.refresh.generation}`
    ) {
      await queue.deadLetter(
        item.key,
        item.claimToken,
        "invalid_official_url_intake_payload: refresh generation does not match the claimed queue key",
      );
      continue;
    }

    leads.push({
      lead: {
        officialUrl: parsed.data.officialUrl,
        discoveryWorkKey: item.key,
        discoveryWorkClaimToken: item.claimToken,
      },
      provenanceSource:
        `official_direct:operator:${parsed.data.authority.appUserId}`,
    });
  }

  return leads;
}
