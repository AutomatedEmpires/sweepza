import "server-only";

import { ensureCurrentAppUser } from "@/lib/auth";
import { createStripePortalSession as createStripePortalUrl } from "@/lib/stripe/checkout";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { hostListingEditSchema } from "@/lib/host-listing-schema";
import { getHostByAppUserId } from "./hosts";
import type { HostRow, ListingRow, NotificationPrefRow, SubscriptionRow } from "./types";

type HostListingDashboardRow = Pick<
  ListingRow,
  | "id"
  | "slug"
  | "title"
  | "lifecycle_status"
  | "visibility_status"
  | "published_at"
  | "updated_at"
  | "end_date"
>;

export interface HostDashboardSnapshot {
  host: HostRow | null;
  subscription: SubscriptionRow | null;
  recentListings: HostListingDashboardRow[];
  counts: {
    total: number;
    active: number;
    draft: number;
    public: number;
    endingSoon: number;
  };
}

const ENDING_SOON_DAYS = 7;

function isEndingSoon(endDate: string | null): boolean {
  if (!endDate) return false;

  const today = new Date();
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= ENDING_SOON_DAYS;
}

export async function getHostDashboardSnapshotForAppUser(
  appUserId: string,
): Promise<HostDashboardSnapshot> {
  const supabase = createServiceRoleClient();
  const host = await getHostByAppUserId(appUserId);

  if (!host) {
    return {
      host: null,
      subscription: null,
      recentListings: [],
      counts: { total: 0, active: 0, draft: 0, public: 0, endingSoon: 0 },
    };
  }

  const [subscriptionResult, listingsResult] = await Promise.all([
    supabase
      .from("subscription")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<SubscriptionRow[]>(),
    supabase
      .from("listing")
      .select(
        "id, slug, title, lifecycle_status, visibility_status, published_at, updated_at, end_date",
      )
      .eq("host_id", host.id)
      .order("updated_at", { ascending: false })
      .returns<HostListingDashboardRow[]>(),
  ]);

  if (subscriptionResult.error) {
    throw new Error(
      `getHostDashboardSnapshotForAppUser subscription lookup failed: ${subscriptionResult.error.message}`,
    );
  }

  if (listingsResult.error) {
    throw new Error(
      `getHostDashboardSnapshotForAppUser listing lookup failed: ${listingsResult.error.message}`,
    );
  }

  const subscription = subscriptionResult.data?.[0] ?? null;
  const listings = listingsResult.data ?? [];

  return {
    host,
    subscription,
    recentListings: listings.slice(0, 6),
    counts: {
      total: listings.length,
      active: listings.filter((listing) => listing.lifecycle_status === "active").length,
      draft: listings.filter((listing) => listing.lifecycle_status === "draft").length,
      public: listings.filter((listing) => listing.visibility_status === "public").length,
      endingSoon: listings.filter((listing) => isEndingSoon(listing.end_date)).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Host Experience (Lane E): listing management, edit, analytics, prefs, billing
//
// All operations below run through the service-role client AND are gated by
// `getHostIdentity()` (auth + host-role check) with every query constrained by
// the resolved hostId. This mirrors the rest of the host data layer
// (lib/db/hosts.ts, lib/db/listing-review.ts) and avoids relying on a Clerk
// JWT being threaded into an RLS-scoped anon client.
// ---------------------------------------------------------------------------

// Error carrying an HTTP status so API routes can return controlled responses.
export class HostAccessError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "HostAccessError";
    this.status = status;
  }
}

export interface HostIdentity {
  appUserId: string;
  hostId: string;
  host: HostRow;
}

export async function getHostIdentity(): Promise<HostIdentity> {
  const authUser = await ensureCurrentAppUser();
  if (!authUser) throw new HostAccessError("Unauthorized.", 401);
  if (!authUser.appUser.is_host) throw new HostAccessError("Host access required.", 403);
  const host = await getHostByAppUserId(authUser.appUserId);
  if (!host) throw new HostAccessError("Host profile is missing for this account.", 409);
  return { appUserId: authUser.appUserId, hostId: host.id, host };
}

async function getOwnedListings(hostId: string): Promise<ListingRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("host_id", hostId)
    .order("updated_at", { ascending: false })
    .returns<ListingRow[]>();
  if (error) throw new Error(`getOwnedListings failed: ${error.message}`);
  return data ?? [];
}

async function getOwnedListing(hostId: string, listingId: string): Promise<ListingRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("id", listingId)
    .eq("host_id", hostId)
    .maybeSingle<ListingRow>();
  if (error) throw new Error(`getOwnedListing failed: ${error.message}`);
  if (!data) throw new HostAccessError("Listing not found for this host.", 404);
  return data;
}

interface ListingStats {
  viewCount: number;
  saveCount: number;
  enterCount: number;
  entriesThisWeek: number;
  entriesLastWeek: number;
}

function emptyStats(): ListingStats {
  return { viewCount: 0, saveCount: 0, enterCount: 0, entriesThisWeek: 0, entriesLastWeek: 0 };
}

async function getListingStats(listingIds: string[]): Promise<Map<string, ListingStats>> {
  const result = new Map<string, ListingStats>();
  for (const id of listingIds) result.set(id, emptyStats());
  if (listingIds.length === 0) return result;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing_seeker_state")
    .select("listing_id, viewed_at, saved_at, entered_at")
    .in("listing_id", listingIds)
    .returns<Array<{ listing_id: string; viewed_at: string | null; saved_at: string | null; entered_at: string | null }>>();
  if (error) throw new Error(`getListingStats failed: ${error.message}`);

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (const row of data ?? []) {
    const stats = result.get(row.listing_id);
    if (!stats) continue;
    if (row.viewed_at) stats.viewCount += 1;
    if (row.saved_at) stats.saveCount += 1;
    if (row.entered_at) {
      stats.enterCount += 1;
      const age = now - new Date(row.entered_at).getTime();
      if (age >= 0 && age < weekMs) stats.entriesThisWeek += 1;
      else if (age >= weekMs && age < 2 * weekMs) stats.entriesLastWeek += 1;
    }
  }
  return result;
}

export interface HostListingSummary {
  id: string;
  title: string;
  prizeValue: number | null;
  endDate: string | null;
  lifecycleStatus: ListingRow["lifecycle_status"];
  moderationStatus: ListingRow["moderation_status"];
  reviewNotes: string | null;
  entryCount: number;
}

export interface HostListingGroups {
  active: HostListingSummary[];
  pending_review: HostListingSummary[];
  held_rejected: HostListingSummary[];
  expired: HostListingSummary[];
}

export async function getHostListingsSnapshot(): Promise<{ groups: HostListingGroups }> {
  const { hostId } = await getHostIdentity();
  const listings = await getOwnedListings(hostId);
  const stats = await getListingStats(listings.map((l) => l.id));

  const groups: HostListingGroups = { active: [], pending_review: [], held_rejected: [], expired: [] };

  for (const l of listings) {
    const summary: HostListingSummary = {
      id: l.id,
      title: l.title,
      prizeValue: l.prize_value,
      endDate: l.end_date,
      lifecycleStatus: l.lifecycle_status,
      moderationStatus: l.moderation_status,
      reviewNotes: l.review_notes,
      entryCount: stats.get(l.id)?.enterCount ?? 0,
    };

    // Exclusive categorization: held/rejected takes priority so an item never
    // appears in two groups (e.g. active + moderation held).
    if (
      l.lifecycle_status === "held" ||
      l.lifecycle_status === "rejected" ||
      l.moderation_status === "held" ||
      l.moderation_status === "rejected"
    ) {
      groups.held_rejected.push(summary);
    } else if (l.lifecycle_status === "expired") {
      groups.expired.push(summary);
    } else if (l.lifecycle_status === "active") {
      groups.active.push(summary);
    } else if (l.lifecycle_status === "draft" || l.lifecycle_status === "pending_review") {
      groups.pending_review.push(summary);
    }
  }

  return { groups };
}

export async function submitForReview(listingId: string): Promise<void> {
  const { hostId } = await getHostIdentity();
  const listing = await getOwnedListing(hostId, listingId);
  if (listing.lifecycle_status !== "draft") {
    throw new HostAccessError("Only draft listings can be submitted for review.", 400);
  }
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "pending_review", moderation_status: "submitted" })
    .eq("id", listingId)
    .eq("host_id", hostId);
  if (error) throw new Error(`submitForReview failed: ${error.message}`);
}

export async function deactivateListing(listingId: string): Promise<void> {
  const { hostId } = await getHostIdentity();
  const listing = await getOwnedListing(hostId, listingId);
  if (listing.lifecycle_status !== "active") {
    throw new HostAccessError("Only active listings can be deactivated.", 400);
  }
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("listing")
    .update({ lifecycle_status: "inactive", visibility_status: "unlisted" })
    .eq("id", listingId)
    .eq("host_id", hostId);
  if (error) throw new Error(`deactivateListing failed: ${error.message}`);
}

function isEditable(listing: ListingRow): boolean {
  return (
    listing.lifecycle_status === "draft" ||
    listing.lifecycle_status === "held" ||
    listing.moderation_status === "held"
  );
}

export async function getHostListingForEdit(listingId: string): Promise<ListingRow> {
  const { hostId } = await getHostIdentity();
  const listing = await getOwnedListing(hostId, listingId);
  if (!isEditable(listing)) throw new HostAccessError("Only draft or held listings can be edited.", 400);
  return listing;
}

export async function saveHostListingEdit(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) throw new HostAccessError("Missing listingId.", 400);

  const { hostId } = await getHostIdentity();
  const current = await getOwnedListing(hostId, listingId);
  if (!isEditable(current)) throw new HostAccessError("Only draft or held listings can be edited.", 400);

  const rawPrize = String(formData.get("prize_value") ?? "").trim();
  const parsed = hostListingEditSchema.parse({
    title: formData.get("title"),
    short_description: formData.get("short_description"),
    prize_name: formData.get("prize_name"),
    prize_value: rawPrize === "" ? null : rawPrize,
    entry_url: String(formData.get("entry_url") ?? "").trim(),
  });

  const updates: Record<string, unknown> = {
    title: parsed.title,
    short_description: parsed.short_description,
    prize_name: parsed.prize_name,
    prize_value: parsed.prize_value ?? null,
    entry_url: parsed.entry_url ?? null,
  };

  // Re-enter review only via the narrow held -> draft transitions the trigger
  // permits. Guard each field independently against its own current value so a
  // non-held moderation/lifecycle state is never pushed into an invalid one.
  if (current.moderation_status === "held") updates.moderation_status = "draft";
  if (current.lifecycle_status === "held") updates.lifecycle_status = "draft";

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("listing")
    .update(updates)
    .eq("id", listingId)
    .eq("host_id", hostId);
  if (error) throw new Error(`saveHostListingEdit failed: ${error.message}`);
}

export interface HostAnalytics {
  totalSaves: number;
  totalEnters: number;
  entriesThisWeek: number;
  entriesLastWeek: number;
  entriesWeekDeltaPct: number | null;
  topListing: { title: string; enterCount: number } | null;
  perListing: Array<{ listingId: string; title: string; viewCount: number; enterCount: number; conversionRatePct: number }>;
}

export async function getHostAnalytics(): Promise<HostAnalytics> {
  const { hostId } = await getHostIdentity();
  const listings = await getOwnedListings(hostId);
  const stats = await getListingStats(listings.map((l) => l.id));

  const perListing = listings.map((l) => {
    const s = stats.get(l.id) ?? emptyStats();
    return {
      listingId: l.id,
      title: l.title,
      viewCount: s.viewCount,
      enterCount: s.enterCount,
      conversionRatePct: s.viewCount === 0 ? 0 : Math.round((s.enterCount / s.viewCount) * 100),
    };
  });

  const totals = [...stats.values()].reduce(
    (acc, s) => {
      acc.totalSaves += s.saveCount;
      acc.totalEnters += s.enterCount;
      acc.entriesThisWeek += s.entriesThisWeek;
      acc.entriesLastWeek += s.entriesLastWeek;
      return acc;
    },
    { totalSaves: 0, totalEnters: 0, entriesThisWeek: 0, entriesLastWeek: 0 },
  );

  const top = [...perListing].sort((a, b) => b.enterCount - a.enterCount)[0];

  return {
    ...totals,
    entriesWeekDeltaPct:
      totals.entriesLastWeek === 0
        ? null
        : Math.round(((totals.entriesThisWeek - totals.entriesLastWeek) / totals.entriesLastWeek) * 100),
    topListing: top && top.enterCount > 0 ? { title: top.title, enterCount: top.enterCount } : null,
    perListing,
  };
}

export interface HostNotificationPrefs {
  email_on_listing_approved: boolean;
  email_on_listing_held: boolean;
  email_on_listing_expiring_soon: boolean;
  email_on_new_reaction: boolean;
}

export async function getNotificationPrefs(): Promise<NotificationPrefRow> {
  const { appUserId } = await getHostIdentity();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("notification_pref")
    .select("*")
    .eq("app_user_id", appUserId)
    .maybeSingle<NotificationPrefRow>();
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

export async function saveNotificationPrefs(prefs: HostNotificationPrefs): Promise<void> {
  const { appUserId } = await getHostIdentity();
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("notification_pref")
    .upsert({ app_user_id: appUserId, ...prefs }, { onConflict: "app_user_id" });
  if (error) throw new Error(`saveNotificationPrefs failed: ${error.message}`);
}

// Validates and persists a host logo URL. Path must live under the host's own
// folder in the host-logos bucket.
export async function updateHostLogo(logoUrl: string | null): Promise<void> {
  const { hostId } = await getHostIdentity();
  if (logoUrl) {
    if (!/^https?:\/\//.test(logoUrl)) throw new HostAccessError("Logo URL must be absolute.", 400);
    if (!logoUrl.includes(`/host-logos/${hostId}/`)) {
      throw new HostAccessError("Logo path must belong to this host.", 400);
    }
  }
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("host").update({ logo_url: logoUrl }).eq("id", hostId);
  if (error) throw new Error(`updateHostLogo failed: ${error.message}`);
}

const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Server-side logo upload. Runs under the service-role client so it does not
// depend on a Clerk-scoped storage session; ownership is enforced here and the
// object path is constrained to the host's own folder.
export async function uploadHostLogo(file: File): Promise<string> {
  const { hostId } = await getHostIdentity();
  if (!ALLOWED_LOGO_TYPES.has(file.type)) throw new HostAccessError("Unsupported file type.", 400);
  if (file.size > MAX_LOGO_BYTES) throw new HostAccessError("File too large (max 2MB).", 400);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${hostId}/${Date.now()}.${ext}`;
  const supabase = createServiceRoleClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("host-logos")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) throw new Error(`Logo upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from("host-logos").getPublicUrl(path);
  await updateHostLogo(data.publicUrl);
  return data.publicUrl;
}

export interface HostBillingSnapshot {
  statusLabel: string;
  activeListingCount: number;
  includedActiveListings: number;
  isFull: boolean;
  addSlotPriceMonthly: number;
}

export async function getHostBillingSnapshot(): Promise<HostBillingSnapshot> {
  const { hostId } = await getHostIdentity();
  const supabase = createServiceRoleClient();
  const [subscriptionResult, activeCountResult] = await Promise.all([
    supabase
      .from("subscription")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>(),
    supabase
      .from("listing")
      .select("id", { count: "exact", head: true })
      .eq("host_id", hostId)
      .eq("lifecycle_status", "active"),
  ]);

  if (subscriptionResult.error) throw new Error(`getHostBillingSnapshot subscription lookup failed: ${subscriptionResult.error.message}`);
  if (activeCountResult.error) throw new Error(`getHostBillingSnapshot listing count failed: ${activeCountResult.error.message}`);

  const subscription = subscriptionResult.data;
  const includedActiveListings =
    (subscription?.included_active_listings ?? 1) + (subscription?.purchased_additional_listings ?? 0);
  const status = subscription?.status ?? "no_plan";
  const statusLabel =
    status === "active"
      ? "Active"
      : status === "trialing"
        ? "Trialing"
        : status === "past_due"
          ? "Past Due"
          : status === "canceled"
            ? "Canceled"
            : status === "grace"
              ? "Grace period"
              : "No plan";
  const used = activeCountResult.count ?? 0;

  return {
    statusLabel,
    activeListingCount: used,
    includedActiveListings,
    isFull: used >= includedActiveListings,
    addSlotPriceMonthly: 5,
  };
}

export async function createHostBillingPortalUrl(): Promise<string> {
  const { host } = await getHostIdentity();
  if (!host.stripe_customer_id) throw new HostAccessError("No Stripe customer on file yet.", 400);
  return createStripePortalUrl({ customerId: host.stripe_customer_id });
}
