import "server-only";

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
    .insert({ host_id: hostId })
    .select("*")
    .single<SubscriptionRow>();

  if (error) {
    throw new Error(`ensureSubscriptionForHost insert failed: ${error.message}`);
  }

  return data;
}

// Returns the most recent subscription row for a host, or null if none exists.
// Mirrors the ordering used by ensureSubscriptionForHost so callers see the
// same "latest" row that webhook syncing updates.
export async function getLatestSubscriptionForHost(
  hostId: string,
): Promise<SubscriptionRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("subscription")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<SubscriptionRow[]>();

  if (error) {
    throw new Error(`getLatestSubscriptionForHost failed: ${error.message}`);
  }

  return data?.[0] ?? null;
}

// Counts how many listings are currently active for a host. Pass
// excludeListingId to ignore a specific listing (e.g. when re-evaluating the
// listing that is being approved so it is not double-counted).
export async function countActiveListingsForHost(
  hostId: string,
  excludeListingId?: string,
): Promise<number> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("listing")
    .select("id", { count: "exact", head: true })
    .eq("host_id", hostId)
    .eq("lifecycle_status", "active");

  if (excludeListingId) {
    query = query.neq("id", excludeListingId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`countActiveListingsForHost failed: ${error.message}`);
  }

  return count ?? 0;
}
