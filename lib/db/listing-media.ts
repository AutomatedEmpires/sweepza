import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ListingImagePipelineResult } from "@/lib/ingestion/image-pipeline";
import {
  listingMediaObjectPath,
  type ValidatedImageAsset,
} from "@/lib/ingestion/image-validation";

export const LISTING_MEDIA_BUCKET = "listing-media";

export async function storeListingMedia(asset: ValidatedImageAsset): Promise<{
  storedUrl: string;
  objectPath: string;
  deduplicated: boolean;
}> {
  const supabase = createServiceRoleClient();
  const objectPath = listingMediaObjectPath(asset);
  const { error } = await supabase.storage
    .from(LISTING_MEDIA_BUCKET)
    .upload(objectPath, asset.bytes, {
      contentType: asset.mimeType,
      cacheControl: "31536000",
      upsert: false,
      metadata: {
        sha256: asset.contentHash,
        width: String(asset.width),
        height: String(asset.height),
      },
    });

  const storageError = error as null | { message?: string; statusCode?: string | number; error?: string };
  const duplicate = Boolean(
    storageError
    && (
      String(storageError.statusCode ?? "") === "409"
      || /duplicate|already exists|resource exists/i.test(
        `${storageError.message ?? ""} ${storageError.error ?? ""}`,
      )
    ),
  );
  if (storageError && !duplicate) {
    throw new Error(`listing media upload failed: ${storageError.message ?? storageError.error ?? "unknown storage error"}`);
  }

  const { data } = supabase.storage.from(LISTING_MEDIA_BUCKET).getPublicUrl(objectPath);
  if (!data.publicUrl) throw new Error("listing media upload did not return a public URL");
  return { storedUrl: data.publicUrl, objectPath, deduplicated: duplicate };
}

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
