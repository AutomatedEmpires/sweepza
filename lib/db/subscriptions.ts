import "server-only";

import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { HostRow, SubscriptionRow } from "./types";

function toLocalSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionRow["status"] {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "grace";
    case "incomplete":
      return "grace";
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

function parseMetadataBoolean(
  metadata: Stripe.Metadata | undefined,
  key: string,
): boolean | null {
  const raw = metadata?.[key];
  if (!raw) return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
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

export async function upsertSubscriptionFromStripe(
  hostId: string,
  subscription: Stripe.Subscription,
): Promise<SubscriptionRow> {
  const supabase = createServiceRoleClient();
  const existingResult = await supabase
    .from("subscription")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<SubscriptionRow[]>();

  if (existingResult.error) {
    throw new Error(
      `upsertSubscriptionFromStripe lookup failed: ${existingResult.error.message}`,
    );
  }

  const existing = existingResult.data?.[0] ?? null;
  const includedActiveListings =
    parseMetadataInt(subscription.metadata, "included_active_listings") ??
    existing?.included_active_listings ??
    1;
  const purchasedAdditionalListings =
    parseMetadataInt(subscription.metadata, "purchased_additional_listings") ??
    existing?.purchased_additional_listings ??
    0;
  const maxActiveListings =
    parseMetadataInt(subscription.metadata, "max_active_listings") ??
    existing?.max_active_listings ??
    Math.min(includedActiveListings + purchasedAdditionalListings, 10);

  const payload = {
    host_id: hostId,
    stripe_subscription_id: subscription.id,
    status: toLocalSubscriptionStatus(subscription.status),
    included_active_listings: includedActiveListings,
    purchased_additional_listings: purchasedAdditionalListings,
    max_active_listings: Math.min(maxActiveListings, 10),
    founding_host_number:
      parseMetadataInt(subscription.metadata, "founding_host_number") ??
      existing?.founding_host_number ??
      null,
    founding_discount_percent:
      parseMetadataInt(subscription.metadata, "founding_discount_percent") ??
      existing?.founding_discount_percent ??
      null,
    founding_discount_retained:
      parseMetadataBoolean(subscription.metadata, "founding_discount_retained") ??
      existing?.founding_discount_retained ??
      false,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("subscription")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single<SubscriptionRow>();

    if (error) {
      throw new Error(`upsertSubscriptionFromStripe update failed: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("subscription")
    .insert(payload)
    .select("*")
    .single<SubscriptionRow>();

  if (error) {
    throw new Error(`upsertSubscriptionFromStripe insert failed: ${error.message}`);
  }

  return data;
}
