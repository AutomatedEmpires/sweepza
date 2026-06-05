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
