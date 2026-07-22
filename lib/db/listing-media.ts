import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ListingImagePipelineResult } from "@/lib/ingestion/image-pipeline";

/** Persist diagnostics and update the canonical listing in one DB transaction. */
export async function finalizeListingImage(input: {
  listingId: string;
  sourcePageUrl: string;
  result: ListingImagePipelineResult;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("finalize_listing_image", {
    p_listing_id: input.listingId,
    p_result: {
      sourcePageUrl: input.sourcePageUrl,
      finalStatus: input.result.finalStatus,
      fallbackUrl: input.result.fallbackUrl,
      selected: input.result.selected,
      diagnostics: input.result.diagnostics,
      retryable: input.result.retryable,
      processedAt: new Date().toISOString(),
    },
  });
  if (error) throw new Error(`finalizeListingImage failed: ${error.message}`);
}
