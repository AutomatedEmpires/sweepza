import "server-only";

import Stripe from "stripe";
import { assertPaymentsEnabled } from "@/lib/billing/payment-gate";
import type { AppUserRow, HostRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { updateHostStripeCustomerId } from "@/lib/db/hosts";

let stripeClient: Stripe | null = null;
let stripeAccountVerification: Promise<void> | null = null;

const APPROVED_STRIPE_ACCOUNT_IDS = {
  test: "acct_1TeqgHD7Yqq488pB",
  // Live remains fail-closed until the dedicated Sweepza account completes
  // KYC/payout setup and its immutable account id is reviewed into this list.
  live: null,
} as const;

type StripeMode = keyof typeof APPROVED_STRIPE_ACCOUNT_IDS;

function getStripeKeyMode(key: string): StripeMode | null {
  const match = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/.exec(key);
  return (match?.[1] as StripeMode | undefined) ?? null;
}

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

export async function assertStripeAccountBinding(
  stripe: Stripe,
  expectedLivemode?: boolean,
): Promise<void> {
  assertPaymentsEnabled();
  const secretKey = env.STRIPE_SECRET_KEY;
  const configuredAccountId = env.STRIPE_ACCOUNT_ID;
  if (!secretKey || !configuredAccountId) {
    throw new Error("Stripe account binding is not configured.");
  }
  const mode = getStripeKeyMode(secretKey);
  if (!mode || (expectedLivemode !== undefined && expectedLivemode !== (mode === "live"))) {
    throw new Error("Stripe key mode does not match the requested operation.");
  }
  if (env.VERCEL_ENV === "production" && mode !== "live") {
    throw new Error("Sweepza production payments require live Stripe credentials.");
  }
  const approvedAccountId = APPROVED_STRIPE_ACCOUNT_IDS[mode];
  if (!approvedAccountId || configuredAccountId !== approvedAccountId) {
    throw new Error(`No approved Sweepza ${mode} Stripe account is configured.`);
  }

  if (!stripeAccountVerification) {
    // Use Stripe v22's explicit /v1/account operation so a Connect platform
    // credential cannot satisfy this check by retrieving a configured
    // connected account id.
    stripeAccountVerification = stripe.accounts
      .retrieveCurrent()
      .then((account) => {
        if (account.id !== configuredAccountId) {
          throw new Error("Stripe credentials resolve to a different account.");
        }
        if (mode === "live" && (!account.charges_enabled || !account.payouts_enabled)) {
          throw new Error("Sweepza live Stripe charges and payouts are not enabled.");
        }
      })
      .catch((error) => {
        stripeAccountVerification = null;
        throw error;
      });
  }
  await stripeAccountVerification;
}

export async function ensureStripeCustomerForHost(
  host: HostRow,
  appUser: AppUserRow,
): Promise<{ customerId: string; host: HostRow }> {
  assertPaymentsEnabled();
  const stripe = createStripeServerClient();
  await assertStripeAccountBinding(stripe);
  if (host.stripe_customer_id) {
    await assertStripeCustomerBinding(
      stripe,
      host.stripe_customer_id,
      host.id,
    );
    return { customerId: host.stripe_customer_id, host };
  }

  const existing = await stripe.customers.search({
    query:
      `metadata['venture']:'sweepza' AND metadata['host_id']:'${host.id}'`,
    limit: 10,
  });
  const exactMatches = existing.data.filter(
    (customer) =>
      !customer.deleted &&
      customer.metadata.venture === "sweepza" &&
      customer.metadata.host_id === host.id,
  );
  if (exactMatches.length > 1) {
    throw new Error("Multiple Stripe customers are bound to this Sweepza host.");
  }
  if (exactMatches[0]) {
    const updatedHost = await updateHostStripeCustomerId(
      host.id,
      exactMatches[0].id,
    );
    return { customerId: exactMatches[0].id, host: updatedHost };
  }

  const customer = await stripe.customers.create(
    {
      email: appUser.email ?? undefined,
      name: host.display_name,
      description: `Sweepza host billing profile for ${host.display_name}`,
      metadata: {
        venture: "sweepza",
        host_id: host.id,
        app_user_id: appUser.id,
      },
    },
    { idempotencyKey: `sweepza/customer/${host.id}/v1` },
  );

  const updatedHost = await updateHostStripeCustomerId(host.id, customer.id);
  return { customerId: customer.id, host: updatedHost };
}

/** Fail closed unless a persisted Stripe Customer belongs to this Sweepza host. */
export async function assertStripeCustomerBinding(
  stripe: Stripe,
  customerId: string,
  hostId: string,
): Promise<Stripe.Customer> {
  const customer = await stripe.customers.retrieve(customerId);
  if (
    customer.deleted ||
    customer.metadata.venture !== "sweepza" ||
    customer.metadata.host_id !== hostId
  ) {
    throw new Error("Stripe customer is not bound to this Sweepza host.");
  }
  return customer;
}
