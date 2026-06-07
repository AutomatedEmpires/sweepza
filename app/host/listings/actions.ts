"use server";

import { redirect } from "next/navigation";
import { deactivateListing, submitForReview } from "@/lib/db/host-dashboard";

export async function submitForReviewAction(listingId: string) {
  await submitForReview(listingId);
  redirect("/host/listings");
}

export async function deactivateListingAction(listingId: string) {
  await deactivateListing(listingId);
  redirect("/host/listings");
}
