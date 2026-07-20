import "server-only";

import Stripe from "stripe";
import { assertPaymentsEnabled } from "@/lib/billing/payment-gate";
import type { AppUserRow, HostRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { updateHostStripeCustomerId } from "@/lib/db/hosts";

let stripeClient: Stripe | null = null;

export function createStripeServerClient(): Stripe {
  assertPaymentsEnabled();
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }

  return stripeClient;
}

export async function ensureStripeCustomerForHost(
  host: HostRow,
  appUser: AppUserRow,
): Promise<{ customerId: string; host: HostRow }> {
  assertPaymentsEnabled();
  if (host.stripe_customer_id) {
    return { customerId: host.stripe_customer_id, host };
  }

  const stripe = createStripeServerClient();
  const customer = await stripe.customers.create({
    email: appUser.email ?? undefined,
    name: host.display_name,
    description: `Sweepza host billing profile for ${host.display_name}`,
    metadata: {
      venture: "sweepza",
      host_id: host.id,
      app_user_id: appUser.id,
    },
  });

  const updatedHost = await updateHostStripeCustomerId(host.id, customer.id);
  return { customerId: customer.id, host: updatedHost };
}
