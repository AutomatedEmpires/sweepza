import "server-only";

import Stripe from "stripe";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  // RLS limits this to current_host_id() listings.
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<ListingRow[]>();

  if (error) throw new Error(`getHostListings failed: ${error.message}`);
  return data ?? [];
}

type HostListingStatsRow = {
  listing_id: string;
  view_count: number;
  save_count: number;
  enter_count: number;
  entries_this_week: number;
  entries_last_week: number;
};

async function getHostListingStats(hostId: string, accessToken?: string): Promise<HostListingStatsRow[]> {
  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase.rpc("host_listing_stats", { host_id_in: hostId });
  if (error) throw new Error(`host_listing_stats RPC failed: ${error.message}`);
  return (data ?? []) as HostListingStatsRow[];
}

export async function submitForReview(listingId: string) {
  const supabase = createServerSupabaseClient();

  // Canonical enums do not include moderation_status='submitted'. Use
  // lifecycle_status='pending_review' to represent submission.
  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "pending_review" })
    .eq("id", listingId);

  if (error) throw new Error(`submitForReview failed: ${error.message}`);
}

export async function deactivateListing(listingId: string) {
  const supabase = createServerSupabaseClient();

  // Canonical enums do not include inactive/unlisted; use paused+hidden.
  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "paused", visibility_status: "hidden" })
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
    reviewNotes: (l as unknown as { review_notes?: string | null }).review_notes ?? null,
    entryCount: statsByListingId.get(l.id)?.enter_count ?? 0,
    submitForReviewAction: async () => {
      "use server";
      await submitForReview(l.id);
      redirect("/host/listings");
    },
    deactivateAction: async () => {
      "use server";
      await deactivateListing(l.id);
      redirect("/host/listings");
    },
  }));

  return {
    groups: {
      active: enriched.filter((l) => l.lifecycleStatus === "active"),
      pending_review: enriched.filter((l) => l.lifecycleStatus === "pending_review" || l.lifecycleStatus === "draft"),
      held_rejected: enriched.filter((l) => l.lifecycleStatus === "paused" || l.lifecycleStatus === "rejected"),
      expired: enriched.filter((l) => l.lifecycleStatus === "expired"),
    },
  };
}

export async function getHostListingForEdit(listingId: string): Promise<ListingRow> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("id", listingId)
    .single<ListingRow>();

  if (error) throw new Error(`getHostListingForEdit failed: ${error.message}`);

  if (!(data.lifecycle_status === "draft" || data.lifecycle_status === "paused")) {
    throw new Error("Listing is not editable.");
  }

  return data;
}

export async function editHostListing(formData: FormData) {
  "use server";

  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) throw new Error("Missing listingId");

  const title = String(formData.get("title") ?? "");
  const short_description = String(formData.get("short_description") ?? "");
  const prize_name = String(formData.get("prize_name") ?? "");
  const prize_value_raw = String(formData.get("prize_value") ?? "");
  const entry_url = String(formData.get("entry_url") ?? "");

  const prize_value = prize_value_raw ? Number(prize_value_raw) : null;
  if (prize_value_raw && Number.isNaN(prize_value)) throw new Error("Prize value must be a number.");

  const supabase = createServerSupabaseClient();
  const current = await getHostListingForEdit(listingId);

  const updates: Partial<ListingRow> & Record<string, unknown> = {
    title,
    short_description,
    prize_name,
    prize_value,
    entry_url: entry_url || null,
  };

  // If it was held (represented by paused), return to draft so it re-enters review.
  if (current.lifecycle_status === "paused") updates.lifecycle_status = "draft";

  const { error } = await supabase.from("listing").update(updates).eq("id", listingId);
  if (error) throw new Error(`editHostListing failed: ${error.message}`);

  redirect("/host/listings");
}

export async function getHostAnalytics() {
  const identity = await getHostIdentity();
  const listings = await getHostListings();

  if (listings.length === 0) {
    return {
      totalSaves: 0,
      totalEnters: 0,
      entriesThisWeek: 0,
      entriesLastWeek: 0,
      entriesWeekDeltaPct: null as number | null,
      topListing: null as null | { title: string; enterCount: number },
      perListing: [] as Array<{ listingId: string; title: string; viewCount: number; enterCount: number; conversionRatePct: number }>,
    };
  }

  const stats = await getHostListingStats(identity.hostId);
  const statsById = new Map(stats.map((row) => [row.listing_id, row]));

  const perListing = listings.map((l) => {
    const row = statsById.get(l.id);
    const views = row?.view_count ?? 0;
    const enters = row?.enter_count ?? 0;
    const conversionRatePct = views === 0 ? 0 : Math.round((enters / views) * 100);
    return { listingId: l.id, title: l.title, viewCount: views, enterCount: enters, conversionRatePct };
  });

  const totalSaves = stats.reduce((sum, row) => sum + (row.save_count ?? 0), 0);
  const totalEnters = stats.reduce((sum, row) => sum + (row.enter_count ?? 0), 0);
  const entriesThisWeek = stats.reduce((sum, row) => sum + (row.entries_this_week ?? 0), 0);
  const entriesLastWeek = stats.reduce((sum, row) => sum + (row.entries_last_week ?? 0), 0);
  const entriesWeekDeltaPct = entriesLastWeek === 0 ? null : Math.round(((entriesThisWeek - entriesLastWeek) / entriesLastWeek) * 100);

  const top = [...perListing].sort((a, b) => b.enterCount - a.enterCount)[0];

  return {
    totalSaves,
    totalEnters,
    entriesThisWeek,
    entriesLastWeek,
    entriesWeekDeltaPct,
    topListing: top ? { title: top.title, enterCount: top.enterCount } : null,
    perListing,
  };
}

export async function getNotificationPrefs(): Promise<NotificationPrefRow> {
  const { appUserId } = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notification_pref")
    .select("*")
    .eq("app_user_id", appUserId)
    .maybeSingle<NotificationPrefRow>();

  if (error) throw new Error(`getNotificationPrefs failed: ${error.message}`);

  return (
    data ?? {
      app_user_id: appUserId,
      ends_today: true,
      ends_soon: true,
      new_listings: true,
      saved_listing_ending: true,
      winner_wall_reactions: true,
      winner_wall_verification: true,
      weekly_roundup: true,
      featured_sweeps: false,
      email_enabled: true,
      in_app_enabled: true,
      push_enabled: false,
      updated_at: new Date().toISOString(),
    }
  );
}

export async function updateNotificationPrefs(formData: FormData) {
  "use server";
  const { appUserId } = await getHostIdentity();
  const supabase = createServerSupabaseClient();

  const toBool = (name: string) => Boolean(formData.get(name));
  const row: Partial<NotificationPrefRow> & { app_user_id: string } = {
    app_user_id: appUserId,
    ends_today: toBool("ends_today"),
    ends_soon: toBool("ends_soon"),
    saved_listing_ending: toBool("saved_listing_ending"),
    winner_wall_reactions: toBool("winner_wall_reactions"),
    weekly_roundup: toBool("weekly_roundup"),
  };

  const { error } = await supabase.from("notification_pref").upsert(row);
  if (error) throw new Error(`updateNotificationPrefs failed: ${error.message}`);

  redirect("/host/notifications");
}

export async function updateHostProfile(args: { logo_url: string | null }) {
  const identity = await getHostIdentity();
  const supabase = createServerSupabaseClient();

  if (args.logo_url) {
    const isUrl = /^https?:\/\//.test(args.logo_url);
    if (!isUrl) throw new Error("logo_url must be an absolute URL");
  }

  const { error } = await supabase
    .from("host")
    .update({ logo_url: args.logo_url })
    .eq("id", identity.hostId);

  if (error) throw new Error(`updateHostProfile failed: ${error.message}`);
}

export async function getHostBillingSnapshot() {
  const identity = await getHostIdentity();
  const supabase = createServerSupabaseClient();

  const subscriptionTask = supabase
    .from("subscription")
    .select("*")
    .eq("host_id", identity.hostId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  const activeCountTask = supabase
    .from("listing")
    .select("id", { count: "exact", head: true })
    .eq("host_id", identity.hostId)
    .eq("lifecycle_status", "active");

  const [{ data: subscription }, { count: activeListingCount }] = await Promise.all([
    subscriptionTask,
    activeCountTask,
  ]);

  const includedActiveListings = subscription?.included_active_listings ?? 1;
  const status = subscription?.status ?? "no_plan";
  const statusLabel =
    status === "active"
      ? "Active"
      : status === "grace"
        ? "Trialing"
        : status === "past_due"
          ? "Past Due"
          : status === "canceled"
            ? "Canceled"
            : "No plan";

  const used = activeListingCount ?? 0;

  return {
    statusLabel,
    activeListingCount: used,
    includedActiveListings,
    isFull: used >= includedActiveListings,
    addSlotPriceMonthly: 5,
  };
}

export async function createStripePortalSession() {
  "use server";

  const identity = await getHostIdentity();
  const supabase = createServerSupabaseClient();
  const { data: host, error } = await supabase
    .from("host")
    .select("stripe_customer_id")
    .eq("id", identity.hostId)
    .single<{ stripe_customer_id: string | null }>();

  if (error) throw new Error(`createStripePortalSession host lookup failed: ${error.message}`);
  if (!host.stripe_customer_id) throw new Error("No Stripe customer on file.");

  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe not configured.");

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const session = await stripe.billingPortal.sessions.create({
    customer: host.stripe_customer_id,
    return_url: `${env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/host`,
  });

  redirect(session.url);
}
