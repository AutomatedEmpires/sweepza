import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { HostRow } from "./types";

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
    .is("stripe_customer_id", null)
    .select("*")
    .maybeSingle<HostRow>();

  if (error) {
    throw new Error(`updateHostStripeCustomerId failed: ${error.message}`);
  }
  if (data) return data;

  const { data: current, error: currentError } = await supabase
    .from("host")
    .select("*")
    .eq("id", hostId)
    .single<HostRow>();
  if (currentError) {
    throw new Error(
      `updateHostStripeCustomerId reconciliation failed: ${currentError.message}`,
    );
  }
  if (current.stripe_customer_id !== stripeCustomerId) {
    throw new Error("Host is already bound to a different Stripe customer.");
  }
  return current;
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
