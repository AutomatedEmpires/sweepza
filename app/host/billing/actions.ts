"use server";

import { redirect } from "next/navigation";
import { createHostBillingPortalUrl } from "@/lib/db/host-dashboard";

export async function createStripePortalSessionAction(): Promise<void> {
  const url = await createHostBillingPortalUrl();
  redirect(url);
}
