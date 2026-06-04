import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SeekerUiState } from "./enums";
import type { ListingSeekerStateRow } from "./types";

export type SeekerStateAction = "viewed" | "saved" | "entered" | "skipped" | "won";

const ACTION_TIMESTAMP: Record<SeekerStateAction, keyof ListingSeekerStateRow> = {
  viewed: "viewed_at",
  saved: "saved_at",
  entered: "entered_at",
  skipped: "skipped_at",
  won: "won_at",
};

/** Fetch all seeker-state rows for the signed-in user. */
export async function getSeekerStates(
  appUserId: string,
  accessToken?: string,
): Promise<ListingSeekerStateRow[]> {
  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("listing_seeker_state")
    .select("*")
    .eq("app_user_id", appUserId)
    .returns<ListingSeekerStateRow[]>();
  if (error) throw new Error(`getSeekerStates failed: ${error.message}`);
  return data ?? [];
}

/**
 * Record a seeker action against a listing. Upserts on (app_user_id, listing_id)
 * and stamps the relevant timestamp + optional computed primary_ui_state.
 * Multiple states may coexist (saved + entered); primary_ui_state drives the card button.
 */
export async function recordSeekerAction(args: {
  appUserId: string;
  listingId: string;
  action: SeekerStateAction;
  primaryUiState?: SeekerUiState;
  accessToken?: string;
}): Promise<void> {
  const { appUserId, listingId, action, primaryUiState, accessToken } = args;
  const supabase = createServerSupabaseClient(accessToken);
  const row: Record<string, unknown> = {
    app_user_id: appUserId,
    listing_id: listingId,
    [ACTION_TIMESTAMP[action]]: new Date().toISOString(),
  };
  if (primaryUiState) row.primary_ui_state = primaryUiState;
  const { error } = await supabase
    .from("listing_seeker_state")
    .upsert(row, { onConflict: "app_user_id,listing_id" });
  if (error) throw new Error(`recordSeekerAction failed: ${error.message}`);
}
