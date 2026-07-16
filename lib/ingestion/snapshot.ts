import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { stableHash } from "@/lib/ingestion/fingerprint";

// Self-hosted rules snapshot — capture our own durable copy of the official
// page text so a listing survives link rot and can always be traced to what we
// read. Best-effort: a storage failure (e.g. the bucket doesn't exist yet)
// never blocks ingestion; the listing still lands with its content hash.

const BUCKET = "ingestion-snapshots";

/** Upload the official-page text; returns a `bucket/key` ref, or null on failure. */
export async function snapshotOfficialRules(
  officialUrl: string,
  text: string,
): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const key = `${stableHash(officialUrl)}/${new Date().toISOString().slice(0, 10)}.txt`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, text, { contentType: "text/plain; charset=utf-8", upsert: true });
    if (error) {
      // eslint-disable-next-line no-console
      console.error(`snapshotOfficialRules upload failed: ${error.message}`);
      return null;
    }
    return `${BUCKET}/${key}`;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `snapshotOfficialRules error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
