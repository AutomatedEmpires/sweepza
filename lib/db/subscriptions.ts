import "server-only";

import type Stripe from "stripe";
import {
  computePlanAllowance,
  getAdditionalListingPriceId,
  getBaselinePriceId,
} from "@/lib/billing/plans";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { HostRow, SubscriptionRow } from "./types";

export function toLocalSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionRow["status"] {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "no_plan";
  }
}

function parseMetadataInt(
  metadata: Stripe.Metadata | undefined,
  key: string,
): number | null {
  const raw = metadata?.[key];
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireMetadataInt(
  metadata: Stripe.Metadata | undefined,
  key: string,
): number {
  const value = parseMetadataInt(metadata, key);
  if (value === null) {
    throw new Error(`Stripe subscription metadata is missing ${key}.`);
  }
  return value;
}

export async function getHostByStripeCustomerId(
  stripeCustomerId: string,
): Promise<HostRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("host")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle<HostRow>();

  if (error) {
    throw new Error(`getHostByStripeCustomerId failed: ${error.message}`);
  }

  return data;
}

export interface StripeSubscriptionSyncResult {
  outcome: "processed" | "duplicate" | "ignored_stale" | "ignored_superseded";
  subscriptionId: string | null;
  status: SubscriptionRow["status"] | null;
}

/**
 * Apply one verified Stripe event through the database's atomic event ledger.
 * The RPC owns dedupe, host serialization, stale-event rejection, and the
 * one-subscription-per-host upsert in a single transaction.
 */
export async function applySubscriptionEventFromStripe(
  hostId: string,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
): Promise<StripeSubscriptionSyncResult> {
  if (subscription.metadata.venture !== "sweepza") {
    throw new Error("Stripe subscription is not attributed to Sweepza.");
  }
  if (subscription.metadata.host_id !== hostId) {
    throw new Error("Stripe subscription host metadata does not match the customer.");
  }

  const baselinePriceId = getBaselinePriceId();
  if (!baselinePriceId) {
    throw new Error("Sweepza baseline Stripe price is not configured.");
  }
  const additionalPriceId = getAdditionalListingPriceId();
  let baselineQuantity = 0;
  let additionalQuantity = 0;
  for (const item of subscription.items.data) {
    const quantity = item.quantity ?? 0;
    if (item.price.id === baselinePriceId) {
      baselineQuantity += quantity;
      continue;
    }
    if (additionalPriceId && item.price.id === additionalPriceId) {
      additionalQuantity += quantity;
      continue;
    }
    throw new Error("Stripe subscription contains an unapproved Sweepza price.");
  }
  if (baselineQuantity !== 1) {
    throw new Error("Stripe subscription must contain one Sweepza baseline plan.");
  }

  const allowance = computePlanAllowance(additionalQuantity);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const includedActiveListings = requireMetadataInt(
    subscription.metadata,
    "included_active_listings",
  );
  const purchasedAdditionalListings = requireMetadataInt(
    subscription.metadata,
    "purchased_additional_listings",
  );
  const maxActiveListings = requireMetadataInt(
    subscription.metadata,
    "max_active_listings",
  );
  if (
    includedActiveListings !== allowance.includedActiveListings ||
    purchasedAdditionalListings !== allowance.purchasedAdditionalListings ||
    maxActiveListings !== allowance.maxActiveListings
  ) {
    throw new Error("Stripe entitlement metadata does not match purchased prices.");
  }
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("apply_stripe_subscription_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created_at: event.created,
    p_livemode: event.livemode,
    p_host_id: hostId,
    p_stripe_customer_id: customerId,
    p_stripe_subscription_id: subscription.id,
    p_status: toLocalSubscriptionStatus(subscription.status),
    p_included_active_listings: includedActiveListings,
    p_purchased_additional_listings: purchasedAdditionalListings,
    p_max_active_listings: maxActiveListings,
    p_founding_host_number: null,
    p_founding_discount_percent: null,
    p_founding_discount_retained: false,
  });

  if (error) {
    throw new Error(
      `applySubscriptionEventFromStripe failed: ${error.message}`,
    );
  }

  const result = data as {
    outcome?: StripeSubscriptionSyncResult["outcome"];
    subscription_id?: string | null;
    status?: SubscriptionRow["status"] | null;
  } | null;
  if (
    !result?.outcome ||
    !["processed", "duplicate", "ignored_stale", "ignored_superseded"].includes(
      result.outcome,
    )
  ) {
    throw new Error("applySubscriptionEventFromStripe returned an invalid result.");
  }

  return {
    outcome: result.outcome,
    subscriptionId: result.subscription_id ?? null,
    status: result.status ?? null,
  };
}
