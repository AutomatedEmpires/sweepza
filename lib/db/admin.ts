import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { publicHttpUrlSchema } from "@/lib/http-url-schema";
import { dateOnlyVisibilityFloor } from "@/lib/ingestion/lifecycle";
import type {
  HostVerificationStatus,
  NotificationChannel,
  NotificationStatus,
  ReportAiSeverity,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  SubscriptionStatus,
} from "./enums";

// "Open" reports are any report that has not reached a terminal state
// (resolved / dismissed / action_taken). The DB has no literal 'open' status.
const OPEN_REPORT_STATUSES: ReportStatus[] = [
  "submitted",
  "ai_triage",
  "admin_review",
  "escalated",
];

// Winner posts still awaiting an editorial decision.
const PENDING_WINNER_STATUSES: string[] = ["submitted", "pending_review"];

function safeExternalHref(value: string | null | undefined): string | null {
  const parsed = publicHttpUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Dashboard snapshots
// ---------------------------------------------------------------------------

export interface PlatformSnapshot {
  total_listings: number;
  active_listings: number;
  pending_review_listings: number;
  held_listings: number;
  /** Active+public listings whose end_date has passed — stale inventory. */
  stale_active_listings: number;
}

export async function getPlatformSnapshot(): Promise<PlatformSnapshot> {
  const supabase = createServiceRoleClient();
  const today = dateOnlyVisibilityFloor();
  const [total, active, pendingReview, held, stale] = await Promise.all([
    supabase.from("listing").select("*", { count: "exact", head: true }),
    supabase
      .from("listing")
      .select("*", { count: "exact", head: true })
      .eq("lifecycle_status", "active")
      .eq("visibility_status", "public"),
    supabase
      .from("listing")
      .select("*", { count: "exact", head: true })
      .eq("lifecycle_status", "pending_review"),
    supabase
      .from("listing")
      .select("*", { count: "exact", head: true })
      .eq("moderation_status", "under_review"),
    supabase
      .from("listing")
      .select("*", { count: "exact", head: true })
      .eq("lifecycle_status", "active")
      .eq("visibility_status", "public")
      .lt("end_date", today),
  ]);

  const firstError =
    total.error ?? active.error ?? pendingReview.error ?? held.error ?? stale.error;
  if (firstError) {
    throw new Error(`getPlatformSnapshot failed: ${firstError.message}`);
  }

  return {
    total_listings: total.count ?? 0,
    active_listings: active.count ?? 0,
    pending_review_listings: pendingReview.count ?? 0,
    held_listings: held.count ?? 0,
    stale_active_listings: stale.count ?? 0,
  };
}

export interface HostSnapshot {
  total_hosts: number;
  verified_hosts: number;
  pending_verification: number;
}

export async function getHostSnapshot(): Promise<HostSnapshot> {
  const supabase = createServiceRoleClient();
  const [total, verified, pending] = await Promise.all([
    supabase.from("host").select("*", { count: "exact", head: true }),
    supabase
      .from("host")
      .select("*", { count: "exact", head: true })
      .eq("verification_status", "admin_verified"),
    supabase
      .from("host")
      .select("*", { count: "exact", head: true })
      .eq("verification_status", "self_verified"),
  ]);

  const firstError = total.error ?? verified.error ?? pending.error;
  if (firstError) {
    throw new Error(`getHostSnapshot failed: ${firstError.message}`);
  }

  return {
    total_hosts: total.count ?? 0,
    verified_hosts: verified.count ?? 0,
    pending_verification: pending.count ?? 0,
  };
}

export interface WinnerSnapshot {
  pending_winner_posts: number;
  published_winner_posts: number;
}

export async function getWinnerSnapshot(): Promise<WinnerSnapshot> {
  const supabase = createServiceRoleClient();
  const [pending, published] = await Promise.all([
    supabase
      .from("winner_post")
      .select("*", { count: "exact", head: true })
      .in("review_status", PENDING_WINNER_STATUSES),
    supabase
      .from("winner_post")
      .select("*", { count: "exact", head: true })
      .eq("review_status", "published"),
  ]);

  const firstError = pending.error ?? published.error;
  if (firstError) {
    throw new Error(`getWinnerSnapshot failed: ${firstError.message}`);
  }

  return {
    pending_winner_posts: pending.count ?? 0,
    published_winner_posts: published.count ?? 0,
  };
}

export interface ReportSnapshot {
  open_reports: number;
}

export async function getReportSnapshot(): Promise<ReportSnapshot> {
  const supabase = createServiceRoleClient();
  const { count, error } = await supabase
    .from("report")
    .select("*", { count: "exact", head: true })
    .in("status", OPEN_REPORT_STATUSES);
  if (error) {
    throw new Error(`getReportSnapshot failed: ${error.message}`);
  }
  return { open_reports: count ?? 0 };
}

export interface RecentListing {
  id: string;
  title: string;
  created_at: string;
  lifecycle_status: string;
}

export async function getRecentListings(): Promise<RecentListing[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("id, title, created_at, lifecycle_status")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) {
    throw new Error(`getRecentListings failed: ${error.message}`);
  }
  return (data ?? []) as RecentListing[];
}

// ---------------------------------------------------------------------------
// Sidebar badge counts
// ---------------------------------------------------------------------------

export interface NavBadgeCounts {
  pending_listings: number;
  pending_winners: number;
  open_reports: number;
  pending_hosts: number;
}

export async function getNavBadgeCounts(): Promise<NavBadgeCounts> {
  const supabase = createServiceRoleClient();
  const [listings, winners, reports, hosts] = await Promise.all([
    supabase
      .from("listing")
      .select("*", { count: "exact", head: true })
      .eq("lifecycle_status", "pending_review"),
    supabase
      .from("winner_post")
      .select("*", { count: "exact", head: true })
      .in("review_status", PENDING_WINNER_STATUSES),
    supabase
      .from("report")
      .select("*", { count: "exact", head: true })
      .in("status", OPEN_REPORT_STATUSES),
    supabase
      .from("host")
      .select("*", { count: "exact", head: true })
      .eq("verification_status", "self_verified"),
  ]);

  const firstError =
    listings.error ?? winners.error ?? reports.error ?? hosts.error;
  if (firstError) {
    throw new Error(`getNavBadgeCounts failed: ${firstError.message}`);
  }

  return {
    pending_listings: listings.count ?? 0,
    pending_winners: winners.count ?? 0,
    open_reports: reports.count ?? 0,
    pending_hosts: hosts.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

export type HostFilter = "all" | "pending" | "verified" | "unverified";

const HOST_FILTER_STATUS: Record<
  Exclude<HostFilter, "all">,
  HostVerificationStatus
> = {
  pending: "self_verified",
  verified: "admin_verified",
  unverified: "none",
};

export interface AdminHostRow {
  id: string;
  display_name: string;
  verification_status: HostVerificationStatus;
  user_display_name: string | null;
  email: string | null;
  joined_at: string | null;
  subscription_status: SubscriptionStatus | null;
  max_active_listings: number | null;
  active_listings: number;
}

interface RawAdminHostAppUser {
  display_name: string | null;
  email: string | null;
  created_at: string;
}

interface RawAdminHostSubscription {
  status: SubscriptionStatus;
  max_active_listings: number;
  created_at: string;
}

interface RawAdminHost {
  id: string;
  display_name: string;
  verification_status: HostVerificationStatus;
  created_at: string;
  app_user: RawAdminHostAppUser | RawAdminHostAppUser[] | null;
  subscription: RawAdminHostSubscription[] | null;
}

export async function getAdminHosts(filter: HostFilter): Promise<AdminHostRow[]> {
  const supabase = createServiceRoleClient();
  let query = supabase.from("host").select(
    `id, display_name, verification_status, created_at,
     app_user:app_user_id ( display_name, email, created_at ),
     subscription ( status, max_active_listings, created_at )`,
  );

  if (filter !== "all") {
    query = query.eq("verification_status", HOST_FILTER_STATUS[filter]);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getAdminHosts failed: ${error.message}`);
  }

  const activeCounts = await getActiveListingCountsByHost();

  return ((data ?? []) as RawAdminHost[]).map((row) => {
    const appUser = Array.isArray(row.app_user)
      ? row.app_user[0] ?? null
      : row.app_user;
    const subscriptions = row.subscription ?? [];
    const latestSubscription =
      subscriptions
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

    return {
      id: row.id,
      display_name: row.display_name,
      verification_status: row.verification_status,
      user_display_name: appUser?.display_name ?? null,
      email: appUser?.email ?? null,
      joined_at: appUser?.created_at ?? row.created_at ?? null,
      subscription_status: latestSubscription?.status ?? null,
      max_active_listings: latestSubscription?.max_active_listings ?? null,
      active_listings: activeCounts.get(row.id) ?? 0,
    };
  });
}

async function getActiveListingCountsByHost(): Promise<Map<string, number>> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("host_id")
    .eq("lifecycle_status", "active")
    .eq("visibility_status", "public")
    .not("host_id", "is", null);
  if (error) {
    throw new Error(`getActiveListingCountsByHost failed: ${error.message}`);
  }
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { host_id: string | null }[]) {
    if (!row.host_id) continue;
    counts.set(row.host_id, (counts.get(row.host_id) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface AdminReportRow {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason_code: ReportReason;
  details: string | null;
  ai_severity: ReportAiSeverity | null;
  created_at: string;
  reporter_display_name: string | null;
  target_label: string;
  target_context: string | null;
  target_href: string | null;
}

interface RawReporter {
  display_name: string | null;
}

interface RawAdminReport {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason_code: ReportReason;
  details: string | null;
  ai_severity: ReportAiSeverity | null;
  created_at: string;
  reporter: RawReporter | RawReporter[] | null;
}

export async function getOpenReports(): Promise<AdminReportRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("report")
    .select(
      `id, target_type, target_id, reason_code, details, ai_severity, created_at,
       reporter:reporter_user_id ( display_name )`,
    )
    .in("status", OPEN_REPORT_STATUSES)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getOpenReports failed: ${error.message}`);
  }

  const rows = (data ?? []) as RawAdminReport[];
  const listingIds = [...new Set(rows
    .filter((row) => ["listing", "image", "entry_link"].includes(row.target_type))
    .map((row) => row.target_id))];
  const hostIds = [...new Set(rows.filter((row) => row.target_type === "host").map((row) => row.target_id))];
  const winnerIds = [...new Set(rows.filter((row) => row.target_type === "winner_post").map((row) => row.target_id))];
  const listingMap = new Map<string, { title: string; slug: string; sponsor_name: string | null; official_rules_url: string | null }>();
  const hostMap = new Map<string, { display_name: string; website_url: string | null; account_status: string }>();
  const winnerMap = new Map<string, { caption: string; review_status: string }>();

  if (listingIds.length > 0) {
    const result = await supabase
      .from("listing")
      .select("id, title, slug, sponsor_name, official_rules_url")
      .in("id", listingIds)
      .returns<Array<{ id: string; title: string; slug: string; sponsor_name: string | null; official_rules_url: string | null }>>();
    if (result.error) throw new Error(`getOpenReports listing targets failed: ${result.error.message}`);
    for (const listing of result.data ?? []) listingMap.set(listing.id, listing);
  }
  if (hostIds.length > 0) {
    const result = await supabase
      .from("host")
      .select("id, display_name, website_url, account_status")
      .in("id", hostIds)
      .returns<Array<{ id: string; display_name: string; website_url: string | null; account_status: string }>>();
    if (result.error) throw new Error(`getOpenReports host targets failed: ${result.error.message}`);
    for (const host of result.data ?? []) hostMap.set(host.id, host);
  }
  if (winnerIds.length > 0) {
    const result = await supabase
      .from("winner_post")
      .select("id, caption, review_status")
      .in("id", winnerIds)
      .returns<Array<{ id: string; caption: string; review_status: string }>>();
    if (result.error) throw new Error(`getOpenReports winner targets failed: ${result.error.message}`);
    for (const winner of result.data ?? []) winnerMap.set(winner.id, winner);
  }

  return rows.map((row) => {
    const reporter = Array.isArray(row.reporter)
      ? row.reporter[0] ?? null
      : row.reporter;
    const listing = listingMap.get(row.target_id);
    const host = hostMap.get(row.target_id);
    const winner = winnerMap.get(row.target_id);
    return {
      id: row.id,
      target_type: row.target_type,
      target_id: row.target_id,
      reason_code: row.reason_code,
      details: row.details,
      ai_severity: row.ai_severity,
      created_at: row.created_at,
      reporter_display_name: reporter?.display_name ?? null,
      target_label: listing?.title ?? host?.display_name ?? winner?.caption.slice(0, 80) ?? "Target unavailable",
      target_context: listing
        ? `${listing.sponsor_name ?? "Sponsor not stated"} · ${row.target_type.replaceAll("_", " ")}`
        : host
          ? `Host status: ${host.account_status}`
          : winner
            ? `Winner status: ${winner.review_status}`
            : null,
      target_href: safeExternalHref(listing?.official_rules_url ?? host?.website_url),
    };
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface AdminNotificationRow {
  id: string;
  type: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  created_at: string;
  recipient_display_name: string | null;
  recipient_email: string | null;
}

interface RawRecipient {
  display_name: string | null;
  email: string | null;
}

interface RawAdminNotification {
  id: string;
  type: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  created_at: string;
  recipient: RawRecipient | RawRecipient[] | null;
}

export async function getNotificationLog(
  statusFilter?: NotificationStatus,
): Promise<AdminNotificationRow[]> {
  const supabase = createServiceRoleClient();
  let query = supabase.from("notification_log").select(
    `id, type, channel, status, created_at,
     recipient:app_user_id ( display_name, email )`,
  );
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`getNotificationLog failed: ${error.message}`);
  }

  return ((data ?? []) as RawAdminNotification[]).map((row) => {
    const recipient = Array.isArray(row.recipient)
      ? row.recipient[0] ?? null
      : row.recipient;
    return {
      id: row.id,
      type: row.type,
      channel: row.channel,
      status: row.status,
      created_at: row.created_at,
      recipient_display_name: recipient?.display_name ?? null,
      recipient_email: recipient?.email ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Claims (placeholder support)
// ---------------------------------------------------------------------------

export async function getPendingClaimsCount(): Promise<number> {
  const supabase = createServiceRoleClient();
  const { count, error } = await supabase
    .from("listing_claim")
    .select("*", { count: "exact", head: true })
    .eq("status", "requested");
  if (error) {
    throw new Error(`getPendingClaimsCount failed: ${error.message}`);
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function verifyHost(args: {
  hostId: string;
  actorUserId: string;
  notes: string;
  evidenceUrl: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("moderate_host", {
    p_host_id: args.hostId,
    p_actor_user_id: args.actorUserId,
    p_action: "verify",
    p_notes: args.notes,
    p_evidence_url: args.evidenceUrl,
  });
  if (error) {
    throw new Error(`verifyHost failed: ${error.message}`);
  }
}

export async function suspendHost(args: {
  hostId: string;
  actorUserId: string;
  notes: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("moderate_host", {
    p_host_id: args.hostId,
    p_actor_user_id: args.actorUserId,
    p_action: "suspend",
    p_notes: args.notes,
    p_evidence_url: null,
  });
  if (error) {
    throw new Error(`suspendHost failed: ${error.message}`);
  }
}

export async function dismissReport(args: {
  reportId: string;
  reviewerUserId: string;
  reviewNotes: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("resolve_content_report", {
    p_report_id: args.reportId,
    p_reviewer_user_id: args.reviewerUserId,
    p_action: "dismiss",
    p_review_notes: args.reviewNotes,
  });
  if (error) {
    throw new Error(`dismissReport failed: ${error.message}`);
  }
}

export interface ActOnReportResult {
  target_type: ReportTargetType;
  target_id: string;
}

export async function actOnReport(args: {
  reportId: string;
  reviewerUserId: string;
  reviewNotes: string;
}): Promise<ActOnReportResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .rpc("resolve_content_report", {
      p_report_id: args.reportId,
      p_reviewer_user_id: args.reviewerUserId,
      p_action: "act",
      p_review_notes: args.reviewNotes,
    });
  if (error) {
    throw new Error(`actOnReport failed: ${error.message}`);
  }
  const result = data as {
    target_type?: ReportTargetType;
    target_id?: string;
  } | null;
  if (!result?.target_type || !result.target_id) {
    throw new Error("actOnReport failed: invalid result");
  }
  return { target_type: result.target_type, target_id: result.target_id };
}
