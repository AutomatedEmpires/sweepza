import "server-only";

import { buildGamification, type SeekerGamification } from "@/lib/gamification";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface EntryEventRow {
  listing_id: string;
  entered_on: string;
}

/**
 * Assemble a seeker's gamification snapshot from real recorded activity:
 * distinct entry days (streaks), per-listing entry counts (loyalty), wins, and
 * the breadth of prize categories entered. All derived — nothing self-reported.
 */
export async function getSeekerGamification(
  appUserId: string,
  now: Date = new Date(),
): Promise<SeekerGamification> {
  const supabase = createServiceRoleClient();

  const [{ data: events }, { data: wonRows }] = await Promise.all([
    supabase
      .from("seeker_entry_event")
      .select("listing_id, entered_on")
      .eq("app_user_id", appUserId)
      .returns<EntryEventRow[]>(),
    supabase
      .from("listing_seeker_state")
      .select("listing_id")
      .eq("app_user_id", appUserId)
      .not("won_at", "is", null)
      .returns<Array<{ listing_id: string }>>(),
  ]);

  const entryRows = events ?? [];
  const entryDays = entryRows.map((row) => row.entered_on);

  const perListing = new Map<string, number>();
  for (const row of entryRows) {
    perListing.set(row.listing_id, (perListing.get(row.listing_id) ?? 0) + 1);
  }
  const maxEntriesOnOneListing = perListing.size
    ? Math.max(...perListing.values())
    : 0;

  // Distinct prize categories among entered listings (breadth badge).
  let distinctCategories = 0;
  const enteredListingIds = [...perListing.keys()];
  if (enteredListingIds.length > 0) {
    const { data: listings } = await supabase
      .from("listing")
      .select("prize_category")
      .in("id", enteredListingIds)
      .returns<Array<{ prize_category: string | null }>>();
    distinctCategories = new Set(
      (listings ?? [])
        .map((l) => l.prize_category)
        .filter((c): c is string => Boolean(c)),
    ).size;
  }

  return buildGamification({
    entryDays,
    totalEntries: entryRows.length,
    wins: wonRows?.length ?? 0,
    distinctCategories,
    maxEntriesOnOneListing,
    todayIso: now.toISOString().slice(0, 10),
  });
}
