import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ReportRow } from "./types";

export interface ReportQueueItem {
  id: string;
  target_type: string;
  target_id: string;
  reason_code: string;
  details: string | null;
  status: string;
  ai_severity: string | null;
  resolution_notes_internal: string | null;
  created_at: string;
  resolved_at: string | null;
  reporter_display_name: string | null;
  listing_title: string | null;
  listing_slug: string | null;
}

// Open-ish reports surfaced in the operational queue (oldest first = FIFO).
// Resolved and dismissed reports drop out of the working queue.
const OPEN_REPORT_STATUSES = [
  "submitted",
  "ai_triage",
  "admin_review",
  "escalated",
  "action_taken",
] as const;

type RawReportRow = {
  id: string;
  target_type: string;
  target_id: string;
  reason_code: string;
  details: string | null;
  status: string;
  ai_severity: string | null;
  resolution_notes_internal: string | null;
  created_at: string;
  resolved_at: string | null;
  reporter_user_id: string;
};

// Service-role read; callers MUST verify is_admin/is_owner before invoking.
export async function getReportQueue(): Promise<ReportQueueItem[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("report")
    .select(
      `id, target_type, target_id, reason_code, details, status, ai_severity,
       resolution_notes_internal, created_at, resolved_at, reporter_user_id`,
    )
    .in("status", OPEN_REPORT_STATUSES)
    .order("created_at", { ascending: true })
    .returns<RawReportRow[]>();

  if (error) {
    throw new Error(`getReportQueue failed: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const reporterIds = [...new Set(rows.map((row) => row.reporter_user_id))];
  const listingIds = [
    ...new Set(
      rows
        .filter((row) => row.target_type === "listing")
        .map((row) => row.target_id),
    ),
  ];

  const reportersResult = await supabase
    .from("app_user")
    .select("id, display_name")
    .in("id", reporterIds)
    .returns<{ id: string; display_name: string | null }[]>();

  if (reportersResult.error) {
    throw new Error(
      `getReportQueue reporter lookup failed: ${reportersResult.error.message}`,
    );
  }

  let listingRows: { id: string; title: string; slug: string }[] = [];
  if (listingIds.length > 0) {
    const listingsResult = await supabase
      .from("listing")
      .select("id, title, slug")
      .in("id", listingIds)
      .returns<{ id: string; title: string; slug: string }[]>();
    if (listingsResult.error) {
      throw new Error(
        `getReportQueue listing lookup failed: ${listingsResult.error.message}`,
      );
    }
    listingRows = listingsResult.data ?? [];
  }

  const reporterById = new Map(
    (reportersResult.data ?? []).map((user) => [user.id, user.display_name]),
  );
  const listingById = new Map(listingRows.map((listing) => [listing.id, listing]));

  return rows.map((row) => {
    const listing =
      row.target_type === "listing" ? listingById.get(row.target_id) : undefined;
    return {
      id: row.id,
      target_type: row.target_type,
      target_id: row.target_id,
      reason_code: row.reason_code,
      details: row.details,
      status: row.status,
      ai_severity: row.ai_severity,
      resolution_notes_internal: row.resolution_notes_internal,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      reporter_display_name: reporterById.get(row.reporter_user_id) ?? null,
      listing_title: listing?.title ?? null,
      listing_slug: listing?.slug ?? null,
    };
  });
}

export async function getReportById(reportId: string): Promise<ReportRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("report")
    .select("*")
    .eq("id", reportId)
    .maybeSingle<ReportRow>();

  if (error) {
    throw new Error(`getReportById failed: ${error.message}`);
  }

  return data;
}
