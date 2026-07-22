"use server";

import { redirect } from "next/navigation";
import { saveHostListingEdit } from "@/lib/db/host-dashboard";
import { revalidatePublicListings } from "@/lib/db/listings-cache";

export async function editHostListingAction(formData: FormData): Promise<void> {
  await saveHostListingEdit(formData);
  // Editing always returns the record to private draft review. If it was
  // active, both the cached discovery feed and cached detail page must stop
  // serving the former public version immediately.
  revalidatePublicListings();
  redirect("/host/listings?updated=1");
}
