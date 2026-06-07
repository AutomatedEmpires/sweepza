"use server";

import { revalidatePath } from "next/cache";
import { deactivateListing, submitForReview } from "@/lib/db/host-dashboard";

export async function submitForReviewAction(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;
  await submitForReview(listingId);
  revalidatePath("/host/listings");
}

export async function deactivateListingAction(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;
  await deactivateListing(listingId);
  revalidatePath("/host/listings");
}
