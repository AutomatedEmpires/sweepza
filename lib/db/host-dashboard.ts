import "server-only";

import Stripe from "stripe";
import { env } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ListingRow, NotificationPrefRow, SubscriptionRow } from "@/lib/db/types";

// NOTE: This repo currently does not include Clerk wiring; the "host identity"
// is derived purely from the Supabase JWT via RLS helpers.

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

function listingGroups(rows: ListingRow[]) {
  const groups: Record<string, ListingRow[]> = {
    active: [],
    pending_review: [],
    held_rejected: [],
    expired: [],
  };

  for (const row of rows) {
    if (row.lifecycle_status === "active") groups.active.push(row);
    else if (row.lifecycle_status === "pending_review") groups.pending_review.push(row);
    else if (row.lifecycle_status === "expired") groups.expired.push(row);
    else if (row.lifecycle_status === "rejected" || row.lifecycle_status === "paused") {
      groups.held_rejected.push(row);
    } else {
      // Draft + anything else stays visible under pending_review for now.
      groups.pending_review.push(row);
    }
  }

  return groups;
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

async function getEntryCounts(listingIds: string[], accessToken?: string): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();

  // listing_seeker_state is row-owner only by RLS. To preserve that, we keep this
  // as a best-effort call: it will return 0 unless an admin/owner is viewing.
  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("listing_seeker_state")
    .select("listing_id, entered_at")
    .in("listing_id", listingIds)
    .not("entered_at", "is", null);

  if (error) return new Map();
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ listing_id: string }>) {
    counts.set(row.listing_id, (counts.get(row.listing_id) ?? 0) + 1);
  }
  return counts;
}

export async function submitForReview(listingId: string) {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "pending_review" })
    .eq("id", listingId);

  if (error) throw new Error(`submitForReview failed: ${error.message}`);
}

export async function deactivateListing(listingId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "paused", visibility_status: "hidden" })
    .eq("id", listingId);

  if (error) throw new Error(`deactivateListing failed: ${error.message}`);
}

export async function getHostListingsSnapshot() {
  const listings = await getHostListings();
  const counts = await getEntryCounts(listings.map((l) => l.id));

  const enriched = listings.map((l) => ({
    id: l.id,
    title: l.title,
    prizeValue: l.prize_value,
    endDate: l.end_date,
    lifecycleStatus: l.lifecycle_status,
    reviewNotes: (l as unknown as { review_notes?: string | null }).review_notes ?? null,
    entryCount: counts.get(l.id) ?? 0,
    submitForReviewAction: async () => {
      "use server";
      await submitForReview(l.id);
    },
    deactivateAction: async () => {
      "use server";
      await deactivateListing(l.id);
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

  // Load current row to confirm status and avoid privileged-field writes.
  const current = await getHostListingForEdit(listingId);

  const updates: Partial<ListingRow> & Record<string, unknown> = {
    title,
    short_description,
    prize_name,
    prize_value,
    entry_url: entry_url || null,
  };

  // If it was "held" (mapped to paused), return to draft.
  if (current.lifecycle_status === "paused") updates.lifecycle_status = "draft";

  const { error } = await supabase.from("listing").update(updates).eq("id", listingId);
  if (error) throw new Error(`editHostListing failed: ${error.message}`);
}

export async function getHostAnalytics() {
  const supabase = createServerSupabaseClient();
  const listings = await getHostListings();
  const listingIds = listings.map((l) => l.id);

  if (listingIds.length === 0) {
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

  // NOTE: listing_seeker_state is row-owner-only; this will only work for admin/owner.
  const { data, error } = await supabase
    .from("listing_seeker_state")
    .select("listing_id, viewed_at, saved_at, entered_at")
    .in("listing_id", listingIds);

  if (error) {
    // Return empty stats rather than failing the host dashboard.
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

  const rows = (data ?? []) as Array<{ listing_id: string; viewed_at: string | null; saved_at: string | null; entered_at: string | null }>;

  const totals = { saves: 0, enters: 0 };
  const byListing = new Map<string, { views: number; enters: number }>();
  for (const row of rows) {
    if (row.saved_at) totals.saves += 1;
    if (row.entered_at) totals.enters += 1;
    const agg = byListing.get(row.listing_id) ?? { views: 0, enters: 0 };
    if (row.viewed_at) agg.views += 1;
    if (row.entered_at) agg.enters += 1;
    byListing.set(row.listing_id, agg);
  }

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfWeek.getDate() - 7);

  let thisWeek = 0;
  let lastWeek = 0;
  for (const row of rows) {
    if (!row.entered_at) continue;
    const t = new Date(row.entered_at).getTime();
    if (t >= startOfWeek.getTime()) thisWeek += 1;
    else if (t >= startOfLastWeek.getTime()) lastWeek += 1;
  }

  const entriesWeekDeltaPct = lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

  const perListing = listings.map((l) => {
    const agg = byListing.get(l.id) ?? { views: 0, enters: 0 };
    const conversionRatePct = agg.views === 0 ? 0 : Math.round((agg.enters / agg.views) * 100);
    return { listingId: l.id, title: l.title, viewCount: agg.views, enterCount: agg.enters, conversionRatePct };
  });

  const topListing = [...perListing].sort((a, b) => b.enterCount - a.enterCount)[0];

  return {
    totalSaves: totals.saves,
    totalEnters: totals.enters,
    entriesThisWeek: thisWeek,
    entriesLastWeek: lastWeek,
    entriesWeekDeltaPct,
    topListing: topListing ? { title: topListing.title, enterCount: topListing.enterCount } : null,
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

  // Server Actions cannot return redirects directly when invoked as a <form action>,
  // so we throw a redirect-like response via Next.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw NextResponse.redirect(session.url, { status: 303 });
}
