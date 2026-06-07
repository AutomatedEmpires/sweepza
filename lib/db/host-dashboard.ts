import "server-only";

import { redirect } from "next/navigation";
import { createStripePortalSession as createStripePortalUrl } from "@/lib/stripe/checkout";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hostListingSchema } from "@/lib/host-listing-schema";
import type { ListingRow, NotificationPrefRow, SubscriptionRow } from "@/lib/db/types";

export async function getHostIdentity(accessToken?: string): Promise<{ appUserId: string; hostId: string }> {
  const supabase = createServerSupabaseClient(accessToken);
  const { data: host, error } = await supabase
    .from("host")
    .select("id, app_user_id")
    .maybeSingle<{ id: string; app_user_id: string }>();

  if (error) throw new Error(`getHostIdentity failed: ${error.message}`);
  if (!host) throw new Error("No host profile found for this user.");
  return { hostId: host.id, appUserId: host.app_user_id };
}

async function getHostListings(accessToken?: string): Promise<ListingRow[]> {
  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<ListingRow[]>();

  if (error) throw new Error(`getHostListings failed: ${error.message}`);
  return data ?? [];
}

type HostListingStatsRow = { listing_id: string; view_count: number; save_count: number; enter_count: number; entries_this_week: number; entries_last_week: number };

async function getHostListingStats(hostId: string, accessToken?: string): Promise<HostListingStatsRow[]> {
  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase.rpc("host_listing_stats", { host_id_in: hostId });
  if (error) throw new Error(`host_listing_stats RPC failed: ${error.message}`);
  return (data ?? []) as HostListingStatsRow[];
}

async function getHostListingForOwnedAction(listingId: string): Promise<ListingRow> {
  const identity = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("id", listingId)
    .eq("host_id", identity.hostId)
    .single<ListingRow>();
  if (error) throw new Error(`Host listing lookup failed: ${error.message}`);
  return data;
}

export async function submitForReview(listingId: string) {
  const supabase = createServerSupabaseClient();
  const listing = await getHostListingForOwnedAction(listingId);
  if (listing.lifecycle_status !== "draft") throw new Error("Only draft listings can be submitted.");

  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "pending_review", moderation_status: "submitted" })
    .eq("id", listingId);
  if (error) throw new Error(`submitForReview failed: ${error.message}`);
}

export async function deactivateListing(listingId: string) {
  const supabase = createServerSupabaseClient();
  const listing = await getHostListingForOwnedAction(listingId);
  if (listing.lifecycle_status !== "active") throw new Error("Only active listings can be deactivated.");

  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "inactive", visibility_status: "unlisted" })
    .eq("id", listingId);
  if (error) throw new Error(`deactivateListing failed: ${error.message}`);
}

export async function getHostListingsSnapshot() {
  const listings = await getHostListings();
  const identity = await getHostIdentity();
  const stats = await getHostListingStats(identity.hostId).catch(() => [] as HostListingStatsRow[]);
  const statsByListingId = new Map(stats.map((row) => [row.listing_id, row]));

  const enriched = listings.map((l) => ({
    id: l.id,
    title: l.title,
    prizeValue: l.prize_value,
    endDate: l.end_date,
    lifecycleStatus: l.lifecycle_status,
    moderationStatus: l.moderation_status,
    reviewNotes: l.review_notes,
    entryCount: statsByListingId.get(l.id)?.enter_count ?? 0,
  }));

  return {
    groups: {
      active: enriched.filter((l) => l.lifecycleStatus === "active"),
      pending_review: enriched.filter((l) => l.lifecycleStatus === "pending_review" || l.lifecycleStatus === "draft"),
      held_rejected: enriched.filter((l) => l.lifecycleStatus === "held" || l.lifecycleStatus === "rejected" || l.moderationStatus === "held" || l.moderationStatus === "rejected"),
      expired: enriched.filter((l) => l.lifecycleStatus === "expired"),
    },
  };
}

export async function getHostListingForEdit(listingId: string): Promise<ListingRow> {
  const data = await getHostListingForOwnedAction(listingId);
  if (!(data.lifecycle_status === "draft" || data.moderation_status === "held" || data.lifecycle_status === "held")) throw new Error("Listing is not editable.");
  return data;
}

export async function saveHostListingEdit(formData: FormData) {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) throw new Error("Missing listingId");
  const parsed = hostListingSchema.parse({
    title: formData.get("title"),
    short_description: formData.get("short_description"),
    prize_name: formData.get("prize_name"),
    prize_value: String(formData.get("prize_value") ?? "") === "" ? null : formData.get("prize_value"),
    entry_url: String(formData.get("entry_url") ?? "") || null,
  });

  const supabase = createServerSupabaseClient();
  const current = await getHostListingForEdit(listingId);
  const updates: Record<string, unknown> = {
    title: parsed.title,
    short_description: parsed.short_description,
    prize_name: parsed.prize_name,
    prize_value: parsed.prize_value ?? null,
    entry_url: parsed.entry_url || null,
  };
  if (current.moderation_status === "held" || current.lifecycle_status === "held") {
    updates.moderation_status = "draft";
    updates.lifecycle_status = "draft";
  }

  const { error } = await supabase.from("listing").update(updates).eq("id", listingId);
  if (error) throw new Error(`saveHostListingEdit failed: ${error.message}`);
}

export async function editHostListing(formData: FormData) {
  "use server";
  await saveHostListingEdit(formData);
  redirect("/host/listings");
}

export async function getHostAnalytics() {
  const identity = await getHostIdentity();
  const listings = await getHostListings();
  if (listings.length === 0) return { totalSaves: 0, totalEnters: 0, entriesThisWeek: 0, entriesLastWeek: 0, entriesWeekDeltaPct: null as number | null, topListing: null as null | { title: string; enterCount: number }, perListing: [] as Array<{ listingId: string; title: string; viewCount: number; enterCount: number; conversionRatePct: number }> };

  const stats = await getHostListingStats(identity.hostId);
  const statsById = new Map(stats.map((row) => [row.listing_id, row]));
  const perListing = listings.map((l) => {
    const row = statsById.get(l.id);
    const views = row?.view_count ?? 0;
    const enters = row?.enter_count ?? 0;
    return { listingId: l.id, title: l.title, viewCount: views, enterCount: enters, conversionRatePct: views === 0 ? 0 : Math.round((enters / views) * 100) };
  });
  const totalSaves = stats.reduce((sum, row) => sum + (row.save_count ?? 0), 0);
  const totalEnters = stats.reduce((sum, row) => sum + (row.enter_count ?? 0), 0);
  const entriesThisWeek = stats.reduce((sum, row) => sum + (row.entries_this_week ?? 0), 0);
  const entriesLastWeek = stats.reduce((sum, row) => sum + (row.entries_last_week ?? 0), 0);
  const top = [...perListing].sort((a, b) => b.enterCount - a.enterCount)[0];
  return { totalSaves, totalEnters, entriesThisWeek, entriesLastWeek, entriesWeekDeltaPct: entriesLastWeek === 0 ? null : Math.round(((entriesThisWeek - entriesLastWeek) / entriesLastWeek) * 100), topListing: top ? { title: top.title, enterCount: top.enterCount } : null, perListing };
}

export async function getNotificationPrefs(): Promise<NotificationPrefRow> {
  const { appUserId } = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("notification_pref").select("*").eq("app_user_id", appUserId).maybeSingle<NotificationPrefRow>();
  if (error) throw new Error(`getNotificationPrefs failed: ${error.message}`);
  return {
    app_user_id: appUserId,
    ends_today: data?.ends_today ?? true,
    ends_soon: data?.ends_soon ?? true,
    new_listings: data?.new_listings ?? true,
    saved_listing_ending: data?.saved_listing_ending ?? true,
    winner_wall_reactions: data?.winner_wall_reactions ?? true,
    winner_wall_verification: data?.winner_wall_verification ?? true,
    weekly_roundup: data?.weekly_roundup ?? true,
    featured_sweeps: data?.featured_sweeps ?? false,
    email_enabled: data?.email_enabled ?? true,
    in_app_enabled: data?.in_app_enabled ?? true,
    push_enabled: data?.push_enabled ?? false,
    email_on_listing_approved: data?.email_on_listing_approved ?? true,
    email_on_listing_held: data?.email_on_listing_held ?? true,
    email_on_listing_expiring_soon: data?.email_on_listing_expiring_soon ?? true,
    email_on_new_reaction: data?.email_on_new_reaction ?? true,
    updated_at: data?.updated_at ?? new Date().toISOString(),
  };
}

export async function saveNotificationPrefs(prefs: { email_on_listing_approved: boolean; email_on_listing_held: boolean; email_on_listing_expiring_soon: boolean; email_on_new_reaction: boolean }) {
  const { appUserId } = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("notification_pref").upsert({ app_user_id: appUserId, ...prefs });
  if (error) throw new Error(`saveNotificationPrefs failed: ${error.message}`);
}

export async function updateNotificationPrefs(formData: FormData) {
  "use server";
  await saveNotificationPrefs({
    email_on_listing_approved: Boolean(formData.get("email_on_listing_approved")),
    email_on_listing_held: Boolean(formData.get("email_on_listing_held")),
    email_on_listing_expiring_soon: Boolean(formData.get("email_on_listing_expiring_soon")),
    email_on_new_reaction: Boolean(formData.get("email_on_new_reaction")),
  });
  redirect("/host/notifications");
}

export async function updateHostProfile(args: { logo_url: string | null }) {
  const identity = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  if (args.logo_url) {
    if (!/^https?:\/\//.test(args.logo_url)) throw new Error("logo_url must be an absolute URL");
    if (!args.logo_url.includes("/host-logos/")) throw new Error("Logo must come from the host-logos bucket.");
    if (!args.logo_url.includes(`/host-logos/${identity.hostId}/`)) throw new Error("Logo path must belong to this host.");
  }
  const { error } = await supabase.from("host").update({ logo_url: args.logo_url }).eq("id", identity.hostId);
  if (error) throw new Error(`updateHostProfile failed: ${error.message}`);
}

export async function getHostBillingSnapshot() {
  const identity = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  const subscriptionTask = supabase.from("subscription").select("*").eq("host_id", identity.hostId).order("created_at", { ascending: false }).limit(1).maybeSingle<SubscriptionRow>();
  const activeCountTask = supabase.from("listing").select("id", { count: "exact", head: true }).eq("host_id", identity.hostId).eq("lifecycle_status", "active");
  const [{ data: subscription }, { count: activeListingCount }] = await Promise.all([subscriptionTask, activeCountTask]);
  const includedActiveListings = (subscription?.included_active_listings ?? 1) + (subscription?.purchased_additional_listings ?? 0);
  const status = subscription?.status ?? "no_plan";
  const statusLabel = status === "active" ? "Active" : status === "trialing" || status === "grace" ? "Trialing" : status === "past_due" ? "Past Due" : status === "canceled" ? "Canceled" : "No plan";
  const used = activeListingCount ?? 0;
  return { statusLabel, activeListingCount: used, includedActiveListings, isFull: used >= includedActiveListings, addSlotPriceMonthly: 5 };
}

export async function createHostBillingPortalUrl() {
  const identity = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  const { data: host, error } = await supabase.from("host").select("stripe_customer_id").eq("id", identity.hostId).single<{ stripe_customer_id: string | null }>();
  if (error) throw new Error(`createStripePortalSession host lookup failed: ${error.message}`);
  if (!host.stripe_customer_id) throw new Error("No Stripe customer on file.");
  return createStripePortalUrl({ customerId: host.stripe_customer_id });
}

export async function createStripePortalSession() {
  "use server";
  redirect(await createHostBillingPortalUrl());
}
