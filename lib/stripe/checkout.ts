import "server-only";

import type Stripe from "stripe";
import type { AppUserRow, HostRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import {
  computePlanAllowance,
  getAdditionalListingPriceId,
  getBaselinePriceId,
  HOST_BASELINE_PLAN,
} from "@/lib/billing/plans";
import { createStripeServerClient, ensureStripeCustomerForHost } from "./server";

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

export async function createHostCheckoutSession(
  args: CreateHostCheckoutSessionArgs,
): Promise<HostCheckoutSession> {
  const baselinePriceId = getBaselinePriceId();
  if (!baselinePriceId) {
    throw new Error(
      "Cannot start checkout: set STRIPE_PRICE_HOST_BASELINE to the baseline host plan price ID.",
    );
  }

  const allowance = computePlanAllowance(args.additionalListings ?? 0);
  const additionalPriceId = getAdditionalListingPriceId();

  const stripe = createStripeServerClient();
  const { customerId } = await ensureStripeCustomerForHost(
    args.host,
    args.appUser,
  );

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

  const baseUrl = getAppBaseUrl();
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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: lineItems,
    allow_promotion_codes: true,
    success_url: `${baseUrl}/host?checkout=success`,
    cancel_url: `${baseUrl}/host?checkout=cancelled`,
    metadata,
    subscription_data: {
      metadata,
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return { url: session.url, sessionId: session.id };
}

export async function createStripePortalSession(args: {
  customerId: string;
  returnUrl?: string;
}): Promise<string> {
  const stripe = createStripeServerClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.returnUrl ?? `${getAppBaseUrl()}/host`,
  });
  return session.url;
}
