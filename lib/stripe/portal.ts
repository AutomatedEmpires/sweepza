import "server-only";

import type { AppUserRow, HostRow } from "@/lib/db/types";
import { getAppBaseUrl } from "./checkout";
import { createStripeServerClient, ensureStripeCustomerForHost } from "./server";

export interface CreateHostBillingPortalSessionArgs {
  host: HostRow;
  appUser: AppUserRow;
}

export interface HostBillingPortalSession {
  url: string;
}

// Opens a Stripe Billing Portal session so hosts can self-serve their
// subscription (update payment method, change/cancel plan, view invoices)
// without bespoke billing UI. Reuses the shared Stripe client and the existing
// customer bootstrap from lib/stripe/server.
//
// Requires a Billing Portal configuration to be activated in the Stripe
// Dashboard (Settings -> Billing -> Customer portal).
export async function createHostBillingPortalSession(
  args: CreateHostBillingPortalSessionArgs,
): Promise<HostBillingPortalSession> {
  const stripe = createStripeServerClient();
  const { customerId } = await ensureStripeCustomerForHost(
    args.host,
    args.appUser,
  );

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getAppBaseUrl()}/host`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a billing portal URL.");
  }

  return { url: session.url };
}
