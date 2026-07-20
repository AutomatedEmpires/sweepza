"use server";

import { redirect } from "next/navigation";
import { assertPaymentsEnabled } from "@/lib/billing/payment-gate";
import { createHostBillingPortalUrl } from "@/lib/db/host-dashboard";

export async function createStripePortalSessionAction(): Promise<void> {
  assertPaymentsEnabled();
  const url = await createHostBillingPortalUrl();
  redirect(url);
}
