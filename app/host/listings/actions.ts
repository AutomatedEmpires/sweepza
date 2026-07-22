"use server";

import { revalidatePath } from "next/cache";
import { deactivateListing, reactivateListing, submitForReview } from "@/lib/db/host-dashboard";
import { revalidatePublicListings } from "@/lib/db/listings-cache";

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
  // An active/public listing just went unlisted — drop it from the cached feed.
  revalidatePublicListings();
  revalidatePath("/host/listings");
}

export async function reactivateListingAction(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return;
  await reactivateListing(listingId);
  revalidatePath("/host/listings");
  revalidatePath("/host");
  revalidatePublicListings();
}
