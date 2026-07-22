import "server-only";

import type Stripe from "stripe";
import type { AppUserRow, HostRow } from "@/lib/db/types";
import { assertPaymentsEnabled } from "@/lib/billing/payment-gate";
import { env } from "@/lib/env";
import {
  computePlanAllowance,
  getAdditionalListingPriceId,
  getBaselinePriceId,
  getMaxAdditionalListings,
  HOST_BASELINE_PLAN,
  isBillingConfigured,
} from "@/lib/billing/plans";
import {
  assertStripeAccountBinding,
  createStripeServerClient,
  ensureStripeCustomerForHost,
} from "./server";

export interface CreateHostCheckoutSessionArgs {
  host: HostRow;
  appUser: AppUserRow;
  additionalListings?: number;
}

export interface HostCheckoutSession {
  url: string;
  sessionId: string;
}

function getAppBaseUrl(): string {
  const url = env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error(
      "Cannot start checkout: set NEXT_PUBLIC_APP_URL so Stripe can redirect back to /host.",
    );
  }
  return url.replace(/\/$/, "");
}

// Creates a Stripe Checkout session for the baseline host plan (plus optional
// extra listing capacity) using the existing Stripe server client. Allowance
// values are written to subscription metadata so the existing webhook sync
// (app/api/webhooks/stripe) can map them onto the subscription row.
export async function createHostCheckoutSession(
  args: CreateHostCheckoutSessionArgs,
): Promise<HostCheckoutSession> {
  assertPaymentsEnabled();
  if (!isBillingConfigured()) {
    throw new Error(
      "Cannot start checkout: the complete Stripe application, webhook, price, and app URL tuple is not configured.",
    );
  }
  if (args.host.account_status !== "active") {
    throw new Error("Only an active host account can start Checkout.");
  }
  const baseUrl = getAppBaseUrl();
  const baselinePriceId = getBaselinePriceId();
  if (!baselinePriceId) {
    throw new Error(
      "Cannot start checkout: set STRIPE_PRICE_HOST_BASELINE to the baseline host plan price ID.",
    );
  }

  const requestedAdditional = args.additionalListings ?? 0;
  if (
    !Number.isInteger(requestedAdditional) ||
    requestedAdditional < 0 ||
    requestedAdditional > getMaxAdditionalListings()
  ) {
    throw new Error(
      `Additional listing quantity must be an integer from 0 to ${getMaxAdditionalListings()}.`,
    );
  }
  const allowance = computePlanAllowance(requestedAdditional);
  const additionalPriceId = getAdditionalListingPriceId();

  const stripe = createStripeServerClient();
  // Bind every Checkout operation to the reviewed Sweepza account, including
  // hosts that already have a persisted customer id and therefore skip
  // customer creation.
  await assertStripeAccountBinding(stripe);
  const { customerId } = await ensureStripeCustomerForHost(
    args.host,
    args.appUser,
  );

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  const hasNonterminalSubscription = subscriptions.data.some(
    (subscription) =>
      !["canceled", "incomplete_expired"].includes(subscription.status),
  );
  if (hasNonterminalSubscription) {
    throw new Error(
      "This host already has a Stripe subscription. Manage it in the billing portal.",
    );
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: baselinePriceId, quantity: 1 },
  ];

  if (allowance.purchasedAdditionalListings > 0) {
    if (!additionalPriceId) {
      throw new Error(
        "Cannot sell extra listing capacity: set STRIPE_PRICE_ADDITIONAL_LISTING or request 0 add-ons.",
      );
    }
    lineItems.push({
      price: additionalPriceId,
      quantity: allowance.purchasedAdditionalListings,
    });
  }

  // Stripe metadata values must be strings. These keys mirror exactly what
  // upsertSubscriptionFromStripe reads back off the subscription.
  const metadata: Record<string, string> = {
    venture: "sweepza",
    host_id: args.host.id,
    plan_key: HOST_BASELINE_PLAN.key,
    included_active_listings: String(allowance.includedActiveListings),
    purchased_additional_listings: String(
      allowance.purchasedAdditionalListings,
    ),
    max_active_listings: String(allowance.maxActiveListings),
  };

  const openSessions = await stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 20,
  });
  const reusableSession = openSessions.data.find(
    (session) =>
      session.mode === "subscription" &&
      session.url &&
      session.metadata?.venture === "sweepza" &&
      session.metadata.host_id === args.host.id &&
      session.metadata.max_active_listings ===
        String(allowance.maxActiveListings),
  );
  if (reusableSession?.url) {
    return { url: reusableSession.url, sessionId: reusableSession.id };
  }

  const mismatchedSweepzaSessions = openSessions.data.filter(
    (session) =>
      session.mode === "subscription" &&
      session.metadata?.venture === "sweepza" &&
      session.metadata.host_id === args.host.id,
  );
  for (const session of mismatchedSweepzaSessions) {
    await stripe.checkout.sessions.expire(session.id);
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: args.host.id,
      line_items: lineItems,
      allow_promotion_codes: true,
      success_url: `${baseUrl}/host?checkout=success`,
      cancel_url: `${baseUrl}/host?checkout=cancelled`,
      metadata,
      subscription_data: {
        metadata,
      },
    },
    {
      idempotencyKey:
        `sweepza/checkout/${args.host.id}/${Math.floor(Date.now() / 600_000)}`,
    },
  );

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return { url: session.url, sessionId: session.id };
}

// Creates a Stripe Customer Portal session so a host can self-manage their
// subscription (payment method, cancellation, invoices). Uses the shared
// Stripe SDK client.
export async function createStripePortalSession(args: {
  customerId: string;
  returnUrl?: string;
}): Promise<string> {
  assertPaymentsEnabled();
  const stripe = createStripeServerClient();
  await assertStripeAccountBinding(stripe);
  const session = await stripe.billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.returnUrl ?? `${getAppBaseUrl()}/host`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a billing portal URL.");
  }

  return session.url;
}
