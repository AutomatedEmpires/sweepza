import "server-only";

import { HOST_BASELINE_PLAN } from "@/lib/billing/plans";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { HostRow, SubscriptionRow } from "./types";

export async function getHostByAppUserId(
  appUserId: string,
): Promise<HostRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("host")
    .select("*")
    .eq("app_user_id", appUserId)
    .maybeSingle<HostRow>();

  if (error) {
    throw new Error(`getHostByAppUserId failed: ${error.message}`);
  }

  return data;
}

export async function updateHostStripeCustomerId(
  hostId: string,
  stripeCustomerId: string,
): Promise<HostRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("host")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", hostId)
    .select("*")
    .single<HostRow>();

  if (error) {
    throw new Error(`updateHostStripeCustomerId failed: ${error.message}`);
  }

  return data;
}

export interface HostProfileFields {
  displayName: string;
  websiteUrl?: string | null;
  shortDescription?: string | null;
  logoUrl?: string | null;
}

// Create or update the canonical `host` row for an app user. Used by the
// self-serve host onboarding/profile flow. Runs through the service-role
// client; callers MUST verify is_host before invoking.
export async function upsertHostProfileForAppUser(
  appUserId: string,
  fields: HostProfileFields,
): Promise<HostRow> {
  const supabase = createServiceRoleClient();

  const payload = {
    display_name: fields.displayName,
    website_url: fields.websiteUrl ?? null,
    short_description: fields.shortDescription ?? null,
    logo_url: fields.logoUrl ?? null,
  };

  const existing = await getHostByAppUserId(appUserId);

  if (existing) {
    const { data, error } = await supabase
      .from("host")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single<HostRow>();

    if (error) {
      throw new Error(`upsertHostProfileForAppUser update failed: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("host")
    .insert({ app_user_id: appUserId, ...payload })
    .select("*")
    .single<HostRow>();

  if (error) {
    throw new Error(`upsertHostProfileForAppUser insert failed: ${error.message}`);
  }

  return data;
}

export async function ensureSubscriptionForHost(
  hostId: string,
): Promise<SubscriptionRow> {
  const supabase = createServiceRoleClient();
  const { data: existing, error: existingError } = await supabase
    .from("subscription")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<SubscriptionRow[]>();

  if (existingError) {
    throw new Error(`ensureSubscriptionForHost lookup failed: ${existingError.message}`);
  }

  const current = existing?.[0];
  if (current) return current;

  const { data, error } = await supabase
    .from("subscription")
    .insert({
      host_id: hostId,
      included_active_listings: HOST_BASELINE_PLAN.includedActiveListings,
      purchased_additional_listings: 0,
      max_active_listings: HOST_BASELINE_PLAN.includedActiveListings,
    })
    .select("*")
    .single<SubscriptionRow>();

  if (error) {
    throw new Error(`ensureSubscriptionForHost insert failed: ${error.message}`);
  }

  return data;
}
