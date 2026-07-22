import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SeekerListingActivity } from "@/lib/types/listing";
import type { SeekerUiState } from "./enums";
import type { ListingSeekerStateRow } from "./types";

export interface SeekerStateSnapshot {
  primary: Record<string, SeekerUiState>;
  saved: Record<string, boolean>;
  /** Action timestamps per listing — powers Ready Again and Sweep Routine. */
  activity: Record<string, SeekerListingActivity>;
}

/** Fetch all seeker-state rows for an app user. */
export async function getSeekerStatesForAppUser(
  appUserId: string,
): Promise<ListingSeekerStateRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing_seeker_state")
    .select("*")
    .eq("app_user_id", appUserId)
    .order("updated_at", { ascending: false })
    .returns<ListingSeekerStateRow[]>();
  if (error) {
    throw new Error(`getSeekerStatesForAppUser failed: ${error.message}`);
  }
  return data ?? [];
}

function toActivity(row: ListingSeekerStateRow): SeekerListingActivity {
  const activity: SeekerListingActivity = { updatedAt: row.updated_at };
  if (row.saved_at) activity.savedAt = row.saved_at;
  if (row.entered_at) activity.enteredAt = row.entered_at;
  if (row.skipped_at) activity.skippedAt = row.skipped_at;
  if (row.won_at) activity.wonAt = row.won_at;
  return activity;
}

export function toSeekerStateSnapshot(
  rows: ListingSeekerStateRow[],
): SeekerStateSnapshot {
  return {
    primary: Object.fromEntries(
      rows.map((row) => [row.listing_id, row.primary_ui_state]),
    ),
    saved: Object.fromEntries(
      rows.filter((row) => row.is_saved).map((row) => [row.listing_id, true]),
    ),
    activity: Object.fromEntries(
      rows.map((row) => [row.listing_id, toActivity(row)]),
    ),
  };
}

export async function getSeekerStateSnapshotForAppUser(
  appUserId: string,
): Promise<SeekerStateSnapshot> {
  const rows = await getSeekerStatesForAppUser(appUserId);
  return toSeekerStateSnapshot(rows);
}

/**
 * Upsert current seeker state for a listing.
 *
 * We intentionally keep this server-controlled for now. Once Clerk -> Supabase
 * JWT wiring is provisioned, this can move back behind direct RLS-authenticated
 * writes with the same shape.
 */
export async function updateSeekerState(args: {
  appUserId: string;
  listingId: string;
  primaryUiState?: SeekerUiState;
  saved?: boolean;
  viewed?: boolean;
}): Promise<ListingSeekerStateRow> {
  const { appUserId, listingId, primaryUiState, saved, viewed } = args;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("update_seeker_state_atomic", {
    p_app_user_id: appUserId,
    p_listing_id: listingId,
    p_primary_ui_state: primaryUiState ?? null,
    p_saved: saved ?? null,
    p_viewed: viewed ?? false,
  });
  if (error) throw new Error(`updateSeekerState failed: ${error.message}`);
  return data as ListingSeekerStateRow;
}
